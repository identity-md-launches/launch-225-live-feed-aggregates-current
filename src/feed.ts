import { sources, kinds, type Entry, type Feed } from "./types";
export function safeUrl(value: unknown, local = false): value is string {
  if (typeof value !== "string") return false;
  if (local && /^\.\/assets\/[a-zA-Z0-9._-]+$/.test(value)) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}
export function parseFeed(data: unknown): Feed {
  const f = data as Feed;
  if (
    !f ||
    f.version !== 1 ||
    !["demo", "live"].includes(f.mode) ||
    !Array.isArray(f.entries) ||
    !Number.isFinite(Date.parse(f.generatedAt))
  )
    throw new Error("Invalid feed");
  const ids = new Set<string>();
  const entries = f.entries
    .filter((e: Entry) => {
      const valid =
        e &&
        typeof e.id === "string" &&
        !ids.has(e.id) &&
        sources.includes(e.source) &&
        kinds.includes(e.kind) &&
        typeof e.author === "string" &&
        typeof e.text === "string" &&
        Number.isFinite(Date.parse(e.publishedAt)) &&
        safeUrl(e.url);
      if (valid) ids.add(e.id);
      return valid;
    })
    .map((e) => ({
      ...e,
      title: typeof e.title === "string" ? e.title : undefined,
      tag: typeof e.tag === "string" ? e.tag.slice(0, 40) : undefined,
      imageAlt: typeof e.imageAlt === "string" ? e.imageAlt : undefined,
      image: safeUrl(e.image, true) ? e.image : undefined,
      sample: f.mode === "demo",
    }));
  return {
    ...f,
    entries: entries.sort(
      (a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt),
    ),
    sources: Array.isArray(f.sources)
      ? f.sources.filter(
          (s) =>
            s &&
            typeof s.name === "string" &&
            ["ok", "error"].includes(s.status),
        )
      : [],
  };
}
export function readStored<T>(
  key: string,
  fallback: T,
  validate: (value: unknown) => boolean,
): T {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(`imd-signal:${key}`) || "null",
    );
    return validate(value) ? (value as T) : fallback;
  } catch {
    return fallback;
  }
}
export function isStringList(value: unknown) {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}
export function dateLabel(date: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(date));
}
