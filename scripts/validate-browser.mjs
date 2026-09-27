import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, extname } from "node:path";
import assert from "node:assert/strict";
const require = createRequire(
  resolve(process.env.IMD_DEPENDENCIES || process.cwd(), "package.json"),
);
const { chromium, expect } = require("@playwright/test");
const { default: AxeBuilder } = require("@axe-core/playwright");
const root = resolve("dist");
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    );
    if (!pathname.startsWith("/preview/")) throw new Error();
    const path = resolve(
      root,
      pathname.slice("/preview/".length) || "index.html",
    );
    if (!path.startsWith(root + "/")) throw new Error();
    const data = await readFile(path);
    res.setHeader(
      "Content-Type",
      {
        ".html": "text/html",
        ".css": "text/css",
        ".js": "text/javascript",
        ".json": "application/json",
        ".svg": "image/svg+xml",
        ".woff2": "font/woff2",
      }[extname(path)] || "application/octet-stream",
    );
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
await mkdir("artifacts", { recursive: true });
const url = `http://127.0.0.1:${server.address().port}/preview/`;
const report = {
  checks: [],
  axe: [],
  contrast: [],
  resourceFailures: [],
  cancelledRequests: [],
  consoleErrors: [],
};
let browser;
const check = async (name, fn) => {
  await fn();
  report.checks.push(name);
  console.log(`PASS ${name}`);
};
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => report.consoleErrors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") report.consoleErrors.push(m.text());
  });
  page.on("requestfailed", (r) => {
    const error = r.failure()?.errorText;
    if (error === "net::ERR_ABORTED") report.cancelledRequests.push(r.url());
    else report.resourceFailures.push(`${error} ${r.url()}`);
  });
  page.on("response", (r) => {
    if (r.status() >= 400)
      report.resourceFailures.push(`${r.status()} ${r.url()}`);
  });
  const cards = page.locator(".feed-card");
  const nav = (name) =>
    page
      .locator(".main-nav")
      .getByRole("button", { name: new RegExp(`^${name}`) });
  await check(
    "Production export loads at /preview/ with local assets and 8 sample entries",
    async () => {
      await page.goto(url);
      await expect(cards).toHaveCount(8);
      await expect(page.locator(".edition-bar")).toContainText(
        "Preview edition",
      );
      assert.equal(
        await page
          .locator("img")
          .evaluateAll((imgs) =>
            imgs.every((i) => i.complete && i.naturalWidth > 0),
          ),
        true,
      );
    },
  );
  await check(
    "Expand and collapse reveal full entry without navigating",
    async () => {
      const read = page.getByRole("button", {
        name: "Read more from The build desk",
        exact: true,
      });
      await read.click();
      await expect(
        page.getByRole("button", { name: "Read less from The build desk" }),
      ).toHaveAttribute("aria-expanded", "true");
      await expect(cards.first()).toContainText("This is an illustrative post");
      await page
        .getByRole("button", { name: "Read less from The build desk" })
        .click();
      await expect(read).toHaveAttribute("aria-expanded", "false");
    },
  );
  await check(
    "Bookmarks persist after reload and are available in Saved",
    async () => {
      await page
        .getByRole("button", {
          name: "Save entry by The build desk",
          exact: true,
        })
        .click();
      await page.reload();
      await expect(
        page.getByRole("button", { name: "Unsave entry by The build desk" }),
      ).toHaveAttribute("aria-pressed", "true");
      await nav("Saved").click();
      await expect(cards).toHaveCount(1);
      await nav("Feed").click();
      await expect(cards).toHaveCount(8);
      await page
        .getByRole("button", { name: "Unsave entry by The build desk" })
        .click();
    },
  );
  await check(
    "Hide, undo, persistent hidden collection, and restore all work",
    async () => {
      await page
        .getByRole("button", { name: "Hide entry by The build desk" })
        .click();
      await expect(cards).toHaveCount(7);
      await expect(
        page.getByRole("button", { name: "Undo", exact: true }),
      ).toBeFocused();
      await page.getByRole("button", { name: "Undo", exact: true }).click();
      await expect(cards).toHaveCount(8);
      await page
        .getByRole("button", { name: "Hide entry by The build desk" })
        .click();
      await page.reload();
      await expect(cards).toHaveCount(7);
      await nav("Hidden").click();
      await expect(cards).toHaveCount(1);
      await page
        .getByRole("button", { name: "Restore entry by The build desk" })
        .click();
      await expect(cards).toHaveCount(0);
      await nav("Feed").click();
      await expect(cards).toHaveCount(8);
    },
  );
  await check(
    "Source filters combine, permit zero selections, and reset",
    async () => {
      const boxes = page.locator(".source-option input");
      await boxes.nth(0).uncheck();
      await expect(cards).toHaveCount(6);
      for (let i = 1; i < 5; i++) await boxes.nth(i).uncheck();
      await expect(cards).toHaveCount(0);
      await expect(page.locator(".empty-state")).toBeVisible();
      await page
        .getByRole("button", { name: "Reset filters", exact: true })
        .click();
      await expect(cards).toHaveCount(8);
    },
  );
  await check(
    "Content type filter isolates videos and combines with sources",
    async () => {
      const buttons = page.locator(".type-options button");
      for (const i of [0, 1, 3, 4]) await buttons.nth(i).click();
      await expect(cards).toHaveCount(1);
      await expect(cards.first().locator(".kind-badge")).toHaveText("Video");
      await page.locator(".source-option input").nth(3).uncheck();
      await expect(cards).toHaveCount(0);
      await page
        .getByRole("button", { name: "Reset filters", exact: true })
        .click();
    },
  );
  await check("Time range and chronological sort are functional", async () => {
    await page.getByLabel("Time range").selectOption("1");
    await expect(cards).toHaveCount(6);
    await page.getByLabel("Time range").selectOption("all");
    await page.getByLabel("Sort signals").selectOption("oldest");
    await expect(cards.first()).toHaveAttribute("data-entry-id", "sample-08");
    await page.getByLabel("Sort signals").selectOption("newest");
    await expect(cards.first()).toHaveAttribute("data-entry-id", "sample-01");
  });
  await check(
    "Search finds content, displays empty state, and clears",
    async () => {
      await page
        .getByRole("searchbox", { name: "Search the feed" })
        .fill("starting point");
      await expect(cards).toHaveCount(1);
      await page.getByRole("searchbox").fill("no-such-signal");
      await expect(cards).toHaveCount(0);
      await page.getByRole("button", { name: "Clear search" }).click();
      await expect(cards).toHaveCount(8);
    },
  );
  await check(
    "Three desktop views change layout and preserve content",
    async () => {
      for (const layout of ["Grid", "Compact", "Timeline"]) {
        await page.getByRole("button", { name: `${layout} view` }).click();
        await expect(page.locator(".workspace")).toHaveClass(
          new RegExp(`view-${layout.toLowerCase()}`),
        );
        await expect(cards).toHaveCount(8);
        if (layout === "Grid") {
          const columns = await page
            .locator(".entries")
            .evaluate((el) => getComputedStyle(el).gridTemplateColumns);
          assert.equal(columns.split(" ").length, 2);
          await page.screenshot({
            path: "artifacts/desktop-grid.jpg",
            type: "jpeg",
            quality: 82,
          });
        }
      }
    },
  );
  await check(
    "About dialog has keyboard focus containment and returns focus on Escape",
    async () => {
      const trigger = page.getByRole("button", { name: "About live sources" });
      await trigger.click();
      await expect(page.locator("dialog")).toBeVisible();
      assert.ok(
        await page.evaluate(() =>
          document.querySelector("dialog").contains(document.activeElement),
        ),
      );
      for (let i = 0; i < 4; i++) {
        await page.keyboard.press("Tab");
        assert.ok(
          await page.evaluate(() =>
            document.querySelector("dialog").contains(document.activeElement),
          ),
        );
      }
      await page.keyboard.press("Escape");
      await expect(page.locator("dialog")).not.toBeVisible();
      await expect(trigger).toBeFocused();
    },
  );
  await check(
    "Day, dusk and night themes persist; automated WCAG A/AA scans",
    async () => {
      for (const theme of ["Day", "Dusk", "Night"]) {
        await page.getByRole("button", { name: `${theme} mode` }).click();
        await expect(page.locator("html")).toHaveAttribute(
          "data-theme",
          theme.toLowerCase(),
        );
        const audit = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze();
        report.axe.push({
          theme,
          violations: audit.violations.map((v) => ({
            id: v.id,
            impact: v.impact,
            nodes: v.nodes.map((n) => ({
              target: n.target,
              summary: n.failureSummary,
            })),
          })),
        });
        const pairs = await page.evaluate(() => {
          const selectors = [
            ".entry-text",
            ".author-name",
            ".entry-meta",
            ".read-more",
            ".source-option",
            ".edition-bar",
            ".project-card p",
            ".pace-card p",
            ".kind-badge",
            ".tag",
            ".date-row",
            ".sample-label",
            ".edition-detail",
            ".quality-note p",
            ".reddit-logo",
          ];
          const parse = (c) => c.match(/[\d.]+/g)?.map(Number) || [];
          const lum = (c) => {
            const a = c.slice(0, 3).map((v) => {
              v /= 255;
              return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
            });
            return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
          };
          return selectors.map((selector) => {
            const el = document.querySelector(selector);
            const cs = getComputedStyle(el);
            let node = el,
              bg;
            while (node) {
              const c = parse(getComputedStyle(node).backgroundColor);
              if (c.length === 3 || c[3] === 1) {
                bg = c;
                break;
              }
              node = node.parentElement;
            }
            const fg = parse(cs.color);
            const l1 = lum(fg),
              l2 = lum(bg);
            return {
              selector,
              foreground: cs.color,
              background: bg,
              ratio: Number(
                ((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)).toFixed(
                  2,
                ),
              ),
            };
          });
        });
        report.contrast.push({ theme, pairs });
        await page.screenshot({
          path: `artifacts/desktop-${theme.toLowerCase()}.jpg`,
          type: "jpeg",
          quality: 82,
        });
      }
      await page.reload();
      await expect(page.locator("html")).toHaveAttribute("data-theme", "night");
    },
  );
  await check("Visible keyboard skip link moves focus to feed", async () => {
    await page.evaluate(() => document.activeElement.blur());
    await page.keyboard.press("Control+Home");
    await page.reload();
    await page.keyboard.press("Tab");
    await expect(page.locator(".skip-link")).toBeFocused();
    await page.screenshot({
      path: "artifacts/keyboard-focus.jpg",
      type: "jpeg",
      quality: 75,
    });
    await page.keyboard.press("Enter");
    await expect(page.locator("main")).toBeFocused();
  });
  await check(
    "Responsive 900, 760, 375, and 320 widths have no horizontal overflow",
    async () => {
      for (const width of [900, 760, 375, 320]) {
        await page.setViewportSize({ width, height: 900 });
        await page.evaluate(() => {
          document.activeElement?.blur();
          window.scrollTo(0, 0);
        });
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          `Overflow at ${width}`,
        );
        if (width === 375 || width === 320)
          await page.screenshot({
            path: `artifacts/mobile-${width}.jpg`,
            type: "jpeg",
            quality: 82,
          });
      }
    },
  );
  await check(
    "200% CSS zoom reflow (separate from browser-native zoom)",
    async () => {
      await page.setViewportSize({ width: 1440, height: 1100 });
      await page.evaluate(() => (document.documentElement.style.zoom = "2"));
      assert.ok(
        await page.evaluate(
          () =>
            document.documentElement.getBoundingClientRect().width <=
            innerWidth + 1,
        ),
      );
      await page.evaluate(() => (document.documentElement.style.zoom = ""));
    },
  );
  await check(
    "Mobile filters open visibly, accept input, and return focus",
    async () => {
      await page.setViewportSize({ width: 375, height: 850 });
      await page.getByRole("button", { name: "Filter signals" }).click();
      await expect(page.locator(".filter-rail")).toBeVisible();
      await expect(page.locator(".filter-rail .text-button")).toBeFocused();
      await page.locator(".source-option input").nth(0).uncheck();
      await page.getByRole("button", { name: "Show 6 signals" }).click();
      await expect(cards).toHaveCount(6);
      await expect(page.locator("#filter-toggle")).toBeFocused();
      await expect(page.locator(".filter-rail")).not.toBeVisible();
      await page.getByRole("button", { name: /Filter signals/ }).click();
      await page.getByRole("button", { name: "Reset", exact: true }).click();
      await page.getByRole("button", { name: "Show 8 signals" }).click();
    },
  );
  await check(
    "Mobile expanded content and dialog remain within viewport",
    async () => {
      await page
        .getByRole("button", { name: "Read more from Swarm journal" })
        .click();
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await page
        .getByRole("button", { name: "Read less from Swarm journal" })
        .click();
      await page.getByRole("button", { name: "About live sources" }).click();
      await expect(page.locator("dialog")).toBeVisible();
      const box = await page.locator("dialog").boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= 375);
      await page.keyboard.press("Escape");
    },
  );
  await check(
    "Reduced motion and forced colors preserve controls",
    async () => {
      await page.emulateMedia({
        reducedMotion: "reduce",
        forcedColors: "active",
      });
      assert.equal(
        await page
          .locator(".button")
          .first()
          .evaluate((el) => getComputedStyle(el).transitionDuration),
        "0s",
      );
      await page.getByRole("button", { name: "Dusk mode" }).focus();
      assert.equal(
        await page.evaluate(
          () => getComputedStyle(document.activeElement).outlineStyle,
        ),
        "solid",
      );
      await page.emulateMedia({ forcedColors: "none" });
      await page.getByRole("button", { name: "Night mode" }).click();
    },
  );
  await check("Mobile WCAG A/AA automated scan", async () => {
    const audit = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    report.axe.push({
      theme: "Night mobile",
      violations: audit.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.map((n) => ({
          target: n.target,
          summary: n.failureSummary,
        })),
      })),
    });
  });
  await check(
    "No unexpected console or asset failures in normal use",
    async () => {
      assert.deepEqual(report.consoleErrors, []);
      assert.deepEqual(report.resourceFailures, []);
    },
  );
  // Isolate deliberate network failures and feed changes from normal resource checks.
  const recovery = await browser.newPage({
    viewport: { width: 1100, height: 850 },
  });
  let mode = "error";
  const sample = JSON.parse(await readFile("dist/feed.json", "utf8"));
  await recovery.route("**/feed.json", async (route) => {
    if (mode === "error")
      return route.fulfill({ status: 503, body: "Unavailable" });
    if (mode === "invalid")
      return route.fulfill({ json: { version: 9, entries: [] } });
    const copy = structuredClone(sample);
    if (mode === "updated") {
      copy.mode = "live";
      copy.generatedAt = "2026-09-27T12:15:00Z";
      copy.entries.unshift({
        ...copy.entries[0],
        id: "new-live",
        sample: false,
        publishedAt: "2026-09-27T12:10:00Z",
      });
    }
    return route.fulfill({ json: copy });
  });
  await check(
    "Initial network failure and malformed feed recover via retry",
    async () => {
      await recovery.goto(url);
      await expect(recovery.getByRole("alert")).toBeVisible();
      mode = "invalid";
      await recovery.getByRole("button", { name: "Try again" }).click();
      await expect(recovery.getByRole("alert")).toBeVisible();
      mode = "sample";
      await recovery.getByRole("button", { name: "Try again" }).click();
      await expect(recovery.locator(".feed-card")).toHaveCount(8);
    },
  );
  await check(
    "Refreshing retains reading position until new entries are accepted",
    async () => {
      mode = "updated";
      await recovery.getByRole("button", { name: "Refresh feed" }).click();
      await expect(
        recovery.getByRole("button", { name: "Show 1 new signal" }),
      ).toBeVisible();
      await expect(recovery.locator(".feed-card")).toHaveCount(8);
      await recovery.getByRole("button", { name: "Show 1 new signal" }).click();
      await expect(recovery.locator(".feed-card")).toHaveCount(9);
      await expect(recovery.locator(".edition-bar")).toContainText(
        "Live edition",
      );
      mode = "error";
      await recovery.getByRole("button", { name: "Refresh feed" }).click();
      await expect(recovery.getByRole("alert")).toBeVisible();
      await expect(recovery.locator(".feed-card")).toHaveCount(9);
    },
  );
  await recovery.close();
  await check(
    "Automated contrast and accessibility checks have no violations",
    async () => {
      const failures = report.axe.flatMap((a) =>
        a.violations.map((v) => ({ theme: a.theme, ...v })),
      );
      assert.deepEqual(failures, []);
      for (const theme of report.contrast)
        for (const pair of theme.pairs)
          assert.ok(
            pair.ratio >= 4.5,
            `${theme.theme} ${pair.selector}: ${pair.ratio}`,
          );
    },
  );
} catch (error) {
  report.failure = error.stack;
  console.error(error);
  process.exitCode = 1;
} finally {
  await writeFile(
    "artifacts/browser-results.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  await browser?.close();
  await new Promise((r) => server.close(r));
}
