import {
  readFile,
  writeFile,
  mkdir,
  rename,
  open,
  unlink,
} from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { curate, httpsUrl } from "./filter.mjs";
import { parseSyndication, parseBluesky, parseX } from "./adapters.mjs";
export const INTERVAL_MS = 15 * 60 * 1000;
async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}
async function atomicJson(path, data) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(data, null, 2) + "\n");
  await rename(temporary, path);
}
export async function boundedBody(response) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Empty response");
  let length = 0;
  const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 2 * 1024 * 1024) throw new Error("Source exceeded 2 MiB");
      chunks.push(Buffer.from(value));
    }
  } finally {
    await reader.cancel();
  }
  return Buffer.concat(chunks).toString("utf8");
}
export function requestFor(source) {
  const headers = {
    Accept:
      "application/json, application/atom+xml, application/rss+xml, application/xml, text/xml;q=0.9",
    "User-Agent": "IMD-Signal/1.0 (feed collector)",
  };
  let url = source.url;
  if (source.type === "bluesky") {
    const u = new URL(
      "https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts",
    );
    u.search = new URLSearchParams({
      q: source.query || '"Identity-MD"',
      sort: "latest",
      limit: "100",
    }).toString();
    url = u.href;
  } else if (source.type === "x") {
    const token = process.env[source.tokenEnv || "IMD_X_BEARER_TOKEN"];
    if (!token) throw new Error("X access token missing");
    headers.Authorization = `Bearer ${token}`;
    const u = new URL("https://api.x.com/2/tweets/search/recent");
    u.search = new URLSearchParams({
      query: `(${source.query || '"Identity-MD" OR "$IMD"'}) -is:retweet -is:reply`,
      max_results: "100",
      "tweet.fields": "created_at,author_id,referenced_tweets,attachments",
      expansions: "author_id,attachments.media_keys",
      "user.fields": "name,username",
      "media.fields": "url,preview_image_url,alt_text,type",
    }).toString();
    url = u.href;
  } else if (!["rss", "atom", "json"].includes(source.type))
    throw new Error("Unknown source type");
  if (!httpsUrl(url))
    throw new Error("Sources must use HTTPS without URL credentials");
  return { url, headers };
}
export async function collect({
  configPath = "service/sources.json",
  outputPath = "public/feed.json",
  statePath,
  fetchImpl = fetch,
  now = Date.now(),
} = {}) {
  const config = await readJson(configPath, null);
  if (!config || !Array.isArray(config.sources))
    throw new Error("Provide a sources configuration");
  const sources = config.sources.filter((s) => s.enabled !== false);
  if (!sources.length) throw new Error("Enable at least one source");
  if (sources.length > 30) throw new Error("At most 30 sources are supported");
  if (
    sources.some(
      (s) => typeof s.id !== "string" || !/^[\w-]{1,64}$/.test(s.id),
    ) ||
    new Set(sources.map((s) => s.id)).size !== sources.length
  )
    throw new Error("Source IDs must be unique");
  const identity = createHash("sha256")
    .update(resolve(outputPath))
    .digest("hex")
    .slice(0, 12);
  statePath ||= resolve(tmpdir(), `imd-signal-${identity}`, "state.json");
  await mkdir(dirname(statePath), { recursive: true });
  const lockPath = `${statePath}.lock`;
  let lock;
  try {
    lock = await open(lockPath, "wx");
  } catch (error) {
    if (error.code === "EEXIST")
      throw new Error(
        "Another collector is running; inspect the state lock if a process crashed",
      );
    throw error;
  }
  try {
    const state = await readJson(statePath, { sources: {} });
    const statuses = [];
    let successful = 0;
    let failed = 0;
    let skipped = 0;
    for (const source of sources) {
      // A changed source definition must not reuse another endpoint's cache or ETag.
      const signature = createHash("sha256")
        .update(JSON.stringify(source))
        .digest("hex");
      const cached =
        state.sources[source.id]?.signature === signature
          ? state.sources[source.id]
          : { entries: [] };
      if (cached.nextAttempt && cached.nextAttempt > now) {
        statuses.push({
          name: source.name || source.id,
          status: cached.failures ? "error" : "ok",
          checkedAt: cached.checkedAt,
        });
        skipped++;
        continue;
      }
      try {
        const { url, headers } = requestFor(source);
        if (cached.etag) headers["If-None-Match"] = cached.etag;
        if (cached.modified) headers["If-Modified-Since"] = cached.modified;
        const response = await fetchImpl(url, {
          headers,
          redirect: "error",
          signal: AbortSignal.timeout(15000),
        });
        if (response.status === 429 || response.status === 503) {
          const retry = response.headers.get("retry-after");
          const seconds = Number(retry);
          const retryTime =
            retry && Number.isFinite(seconds)
              ? now + seconds * 1000
              : Date.parse(retry);
          const error = new Error("Rate limited");
          error.retryTime = Number.isFinite(retryTime)
            ? retryTime
            : now + INTERVAL_MS * 2;
          throw error;
        }
        if (!response.ok && response.status !== 304)
          throw new Error(`HTTP ${response.status}`);
        let entries = cached.entries || [];
        if (response.status !== 304) {
          const body = await boundedBody(response);
          const parsed =
            source.type === "bluesky"
              ? parseBluesky(JSON.parse(body))
              : source.type === "x"
                ? parseX(JSON.parse(body))
                : parseSyndication(
                    body,
                    source,
                    response.headers.get("content-type") || "",
                  );
          entries = curate([...entries, ...parsed], { now }).entries;
        }
        state.sources[source.id] = {
          signature,
          entries,
          etag: response.headers.get("etag") || cached.etag,
          modified: response.headers.get("last-modified") || cached.modified,
          checkedAt: new Date(now).toISOString(),
          failures: 0,
          nextAttempt: now + INTERVAL_MS,
        };
        successful++;
        statuses.push({
          name: source.name || source.id,
          status: "ok",
          checkedAt: new Date(now).toISOString(),
        });
      } catch (error) {
        const failures = (cached.failures || 0) + 1;
        const delay = Math.min(
          INTERVAL_MS * 2 ** Math.min(failures, 5),
          6 * 60 * 60 * 1000,
        );
        state.sources[source.id] = {
          ...cached,
          signature,
          failures,
          checkedAt: new Date(now).toISOString(),
          nextAttempt: Math.min(
            Math.max(now + delay, error.retryTime || 0),
            now + 24 * 60 * 60 * 1000,
          ),
        };
        statuses.push({
          name: source.name || source.id,
          status: "error",
          checkedAt: new Date(now).toISOString(),
        });
        failed++;
        // Do not print URLs or authorization headers from failed requests.
        console.error(
          `Source ${source.id}: unavailable; keeping previously collected entries.`,
        );
      }
    }
    await atomicJson(statePath, state);
    if (!successful) return { published: false, successful, failed, skipped };
    const { entries, rejected } = curate(
      sources.flatMap((s) => state.sources[s.id]?.entries || []),
      { now },
    );
    const feed = {
      version: 1,
      mode: "live",
      generatedAt: new Date(now).toISOString(),
      sources: statuses,
      entries: entries.map(({ mediaKey, ...entry }) => entry),
    };
    await atomicJson(outputPath, feed);
    return {
      published: true,
      successful,
      failed,
      skipped,
      entries: entries.length,
      rejected,
    };
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const args = process.argv.slice(2);
  const get = (name) => {
    const i = args.indexOf(name);
    return i < 0 ? undefined : args[i + 1];
  };
  collect({
    configPath: get("--config"),
    outputPath: get("--output"),
    statePath: get("--state"),
  })
    .then((result) => {
      console.log(JSON.stringify(result));
      if (result.failed && !result.successful) process.exitCode = 1;
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
