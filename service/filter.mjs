import { createHash } from "node:crypto";
export const sourceNames = ["X", "Bluesky", "Web", "YouTube", "Reddit"];
export const kinds = ["Post", "Article", "Video", "Image", "Story"];
export function httpsUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password
      ? u.href
      : null;
  } catch {
    return null;
  }
}
export function canonicalUrl(value) {
  const safe = httpsUrl(value);
  if (!safe) return null;
  const u = new URL(safe);
  u.hash = "";
  for (const key of [...u.searchParams.keys()])
    if (/^(utm_|fbclid$|gclid$)/i.test(key)) u.searchParams.delete(key);
  return u.href.replace(/\/$/, "");
}
export function plainText(value = "") {
  return String(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<(?:br|\/p|\/div)\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&(?:nbsp|#160);/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => {
      const c = Number(n);
      return c > 0 && c <= 0x10ffff ? String.fromCodePoint(c) : "";
    })
    .trim()
    .slice(0, 24000);
}
function tokens(value) {
  return plainText(value)
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(
      (x) =>
        x.length > 2 &&
        ![
          "the",
          "and",
          "for",
          "with",
          "this",
          "that",
          "from",
          "imd",
          "identity",
          "https",
          "www",
        ].includes(x),
    );
}
export function similarity(a, b) {
  const x = new Set(tokens(a)),
    y = new Set(tokens(b));
  if (!x.size || !y.size) return 0;
  const shared = [...x].filter((t) => y.has(t)).length;
  return shared / new Set([...x, ...y]).size;
}
export function assess(raw, now = Date.now()) {
  if (!raw || typeof raw !== "object") return { reason: "invalid" };
  const text = plainText(raw.text),
    title = plainText(raw.title),
    alt = plainText(raw.imageAlt);
  const combined = `${title}\n${text}\n${alt}`;
  const url = canonicalUrl(raw.url);
  const time = Date.parse(raw.publishedAt);
  if (
    !url ||
    !Number.isFinite(time) ||
    time > now + 300000 ||
    typeof raw.author !== "string"
  )
    return { reason: "invalid" };
  if (raw.replyTo || raw.repostOf || /^RT\s+@/i.test(text))
    return { reason: "reply-or-repost" };
  if (
    /guaranteed\s+(?:profit|returns?|\d)|(?:send|transfer)\s+(?:your\s+)?(?:seed phrase|private key)|(?:double|triple)\s+your\s+(?:money|tokens?|crypto)|claim\s+(?:your\s+)?(?:free\s+)?airdrop/i.test(
      combined,
    )
  )
    return { reason: "spam" };
  if (
    (combined.match(/https?:\/\//g) || []).length > 3 ||
    (combined.match(/#[\p{L}\p{N}]+/gu) || []).length > 6 ||
    (combined.match(/\$IMD\b/gi) || []).length > 4
  )
    return { reason: "spam" };
  const image = httpsUrl(raw.image);
  const explicit = /\bidentity[\s-]?md\b|\bimd\.fun\b/i;
  const ticker = /\$IMD\b/i;
  const context =
    /\b(?:blockchain|crypto|token|contributor|swarm|identity|network|ecosystem)\b/i;
  const relevance =
    explicit.test(title) ||
    (explicit.test(combined) &&
      (combined.length < 700 ||
        explicit.test(combined.slice(0, 280)) ||
        (combined.match(/identity[\s-]?md|imd\.fun/gi) || []).length >= 2)) ||
    (ticker.test(combined) &&
      (context.test(combined) || Boolean(image)) &&
      (combined.length < 700 || ticker.test(combined.slice(0, 280))));
  if (!relevance) return { reason: "off-topic" };
  const substantive = tokens(`${title} ${text}`);
  if (
    !image &&
    (substantive.length < 10 ||
      new Set(substantive).size < 8 ||
      `${title} ${text}`.length < 75)
  )
    return { reason: "low-effort" };
  const kind = kinds.includes(raw.kind) ? raw.kind : image ? "Image" : "Post";
  const entry = {
    id: createHash("sha256").update(url).digest("hex").slice(0, 20),
    source: sourceNames.includes(raw.source) ? raw.source : "Web",
    kind,
    author: plainText(raw.author).slice(0, 120),
    title: title || undefined,
    text,
    publishedAt: new Date(time).toISOString(),
    url,
    image: image || undefined,
    imageAlt: alt || undefined,
  };
  if (raw.mediaKey && image)
    entry.mediaKey = String(raw.mediaKey).slice(0, 256);
  return { entry };
}
export function curate(
  rawEntries,
  { now = Date.now(), retentionDays = 60 } = {},
) {
  const rejected = {};
  const accepted = [];
  const note = (reason) => {
    rejected[reason] = (rejected[reason] || 0) + 1;
  };
  const candidates = rawEntries
    .map((raw) => assess(raw, now))
    .filter((result) => {
      if (result.reason) {
        note(result.reason);
        return false;
      }
      return true;
    })
    .map((result) => result.entry)
    .sort((a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt));
  for (const entry of candidates) {
    if (now - Date.parse(entry.publishedAt) > retentionDays * 86400000) {
      note("expired");
      continue;
    }
    const text = `${entry.title || ""} ${entry.text}`;
    const duplicate = accepted.some(
      (old) =>
        old.url === entry.url ||
        (entry.image &&
          old.image &&
          (canonicalUrl(entry.image) === canonicalUrl(old.image) ||
            (entry.mediaKey && entry.mediaKey === old.mediaKey))) ||
        (tokens(text).length >= 10 &&
          similarity(`${old.title || ""} ${old.text}`, text) >= 0.78),
    );
    if (duplicate) {
      note("duplicate");
      continue;
    }
    accepted.push(entry);
  }
  return {
    entries: accepted
      .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
      .slice(0, 500),
    rejected,
  };
}
