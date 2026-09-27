import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collect, INTERVAL_MS } from "./collect.mjs";
const now = Date.parse("2026-09-27T12:00:00Z");
const body = JSON.stringify({
  title: "Test journal",
  items: [
    {
      url: "https://example.com/original",
      date_published: "2026-09-27T11:00:00Z",
      content_text:
        "Identity-MD brings contributors together to create useful public tools for the community and share their original work.",
    },
  ],
});
async function fixture(run) {
  const dir = await mkdtemp(join(tmpdir(), "imd-collector-test-"));
  try {
    const opts = {
      configPath: join(dir, "sources.json"),
      outputPath: join(dir, "feed.json"),
      statePath: join(dir, "state.json"),
      now,
    };
    await writeFile(
      opts.configPath,
      JSON.stringify({
        sources: [
          {
            id: "journal",
            name: "Journal",
            type: "json",
            url: "https://example.com/feed.json",
          },
        ],
      }),
    );
    await run(opts);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
test("collector publishes filtered output atomically and observes cadence and ETag", () =>
  fixture(async (opts) => {
    let calls = 0;
    const first = await collect({
      ...opts,
      fetchImpl: async () => {
        calls++;
        return new Response(body, {
          headers: { etag: '"v1"', "content-type": "application/feed+json" },
        });
      },
    });
    assert.equal(first.entries, 1);
    assert.equal(JSON.parse(await readFile(opts.outputPath)).mode, "live");
    const skip = await collect({
      ...opts,
      fetchImpl: () => {
        throw new Error("Must not fetch before interval");
      },
    });
    assert.equal(skip.skipped, 1);
    assert.equal(skip.published, false);
    const second = await collect({
      ...opts,
      now: now + INTERVAL_MS,
      fetchImpl: async (url, options) => {
        assert.equal(options.headers["If-None-Match"], '"v1"');
        calls++;
        return new Response(null, { status: 304 });
      },
    });
    assert.equal(second.entries, 1);
    assert.equal(calls, 2);
  }));
test("all-source failure preserves existing export and backs off", () =>
  fixture(async (opts) => {
    await writeFile(opts.outputPath, "preserve this snapshot");
    const result = await collect({
      ...opts,
      fetchImpl: async () =>
        new Response("limited", {
          status: 429,
          headers: { "retry-after": "3600" },
        }),
    });
    assert.equal(result.published, false);
    assert.equal(
      await readFile(opts.outputPath, "utf8"),
      "preserve this snapshot",
    );
    const again = await collect({
      ...opts,
      now: now + INTERVAL_MS,
      fetchImpl: () => {
        throw new Error("Must not request during backoff");
      },
    });
    assert.equal(again.skipped, 1);
  }));
test("malformed feed and network failure never replace the export", () =>
  fixture(async (opts) => {
    await writeFile(opts.outputPath, "preserve");
    const result = await collect({
      ...opts,
      fetchImpl: async () =>
        new Response("{broken", {
          headers: { "content-type": "application/json" },
        }),
    });
    assert.equal(result.failed, 1);
    assert.equal(await readFile(opts.outputPath, "utf8"), "preserve");
  }));
test("partial failure retains old entries and reports unavailable sources", () =>
  fixture(async (opts) => {
    await writeFile(
      opts.configPath,
      JSON.stringify({
        sources: [
          { id: "a", name: "A", type: "json", url: "https://a.example/feed" },
          { id: "b", name: "B", type: "json", url: "https://b.example/feed" },
        ],
      }),
    );
    await collect({
      ...opts,
      fetchImpl: async (url) =>
        new Response(
          url.includes("a.example")
            ? body
            : body
                .replace("/original", "/second")
                .replace(
                  "brings contributors together to create useful public tools for the community and share their original work.",
                  "documentation explains blockchain identities through detailed technical examples, diagrams, tutorials, and implementation references.",
                ),
        ),
    });
    await collect({
      ...opts,
      now: now + INTERVAL_MS,
      fetchImpl: async (url) =>
        url.includes("a.example")
          ? new Response(body)
          : new Response("unavailable", { status: 500 }),
    });
    const output = JSON.parse(await readFile(opts.outputPath));
    assert.equal(output.entries.length, 2);
    assert.equal(output.sources.find((s) => s.name === "B").status, "error");
  }));
