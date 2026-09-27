export const sources = ["X", "Bluesky", "Web", "YouTube", "Reddit"] as const;
export const kinds = ["Post", "Article", "Video", "Image", "Story"] as const;
export type Source = (typeof sources)[number];
export type Kind = (typeof kinds)[number];
export interface Entry {
  id: string;
  source: Source;
  kind: Kind;
  author: string;
  handle?: string;
  title?: string;
  text: string;
  publishedAt: string;
  url: string;
  image?: string;
  imageAlt?: string;
  tag?: string;
  sample?: boolean;
}
export interface Feed {
  version: 1;
  mode: "demo" | "live";
  generatedAt: string;
  entries: Entry[];
  sources: { name: string; status: "ok" | "error"; checkedAt: string }[];
}
export type Theme = "day" | "dusk" | "night";
export type View = "timeline" | "grid" | "compact";
export type Collection = "feed" | "saved" | "hidden";
