import { createRequire } from "node:module";
import { resolve } from "node:path";
import { plainText } from "./filter.mjs";
const require = createRequire(
  resolve(process.env.IMD_DEPENDENCIES || process.cwd(), "package.json"),
);
const { XMLParser } = require("fast-xml-parser");
const array = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);
const string = (x) => (typeof x === "string" ? x : x?.["#text"] || "");
const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  processEntities: true,
});
export function parseSyndication(body, source, contentType = "") {
  if (contentType.includes("json") || body.trim().startsWith("{")) {
    const feed = JSON.parse(body);
    if (!Array.isArray(feed.items)) throw new Error("Expected JSON Feed items");
    return feed.items
      .slice(0, 100)
      .map((item) => ({
        source: source.origin || "Web",
        kind: item.image ? "Image" : "Article",
        author:
          item.authors?.[0]?.name ||
          item.author?.name ||
          source.name ||
          feed.title ||
          "Web source",
        title: item.title,
        text: plainText(item.content_text || item.content_html || item.summary),
        url: item.url || item.external_url,
        publishedAt: item.date_published,
        image: item.image,
        imageAlt: item.title,
        replyTo: item.replyTo,
        repostOf: item.repostOf,
      }));
  }
  if (/<!DOCTYPE|<!ENTITY/i.test(body))
    throw new Error("XML declarations are not accepted");
  const doc = xml.parse(body);
  const rss = doc.rss?.channel;
  if (rss) {
    return array(rss.item)
      .slice(0, 100)
      .map((item) => ({
        source: source.origin || "Web",
        kind: source.kind || "Article",
        author:
          string(item["dc:creator"]) ||
          string(item.author) ||
          source.name ||
          string(rss.title),
        title: string(item.title),
        text: plainText(
          string(item["content:encoded"]) || string(item.description),
        ),
        publishedAt: string(item.pubDate) || string(item["dc:date"]),
        url: string(item.link),
        image:
          item["media:content"]?.["@_url"] ||
          item["media:thumbnail"]?.["@_url"] ||
          (/^image\//.test(item.enclosure?.["@_type"])
            ? item.enclosure?.["@_url"]
            : undefined),
        imageAlt: string(item.title),
      }));
  }
  const atom = doc.feed;
  if (!atom) throw new Error("Expected RSS, Atom or JSON Feed");
  return array(atom.entry)
    .slice(0, 100)
    .map((item) => ({
      source: source.origin || "Web",
      kind: source.kind || "Article",
      author: string(item.author?.name) || source.name || string(atom.title),
      title: string(item.title),
      text: plainText(
        string(item.content) ||
          string(item.summary) ||
          string(item["media:group"]?.["media:description"]),
      ),
      publishedAt: string(item.published) || string(item.updated),
      url: array(item.link).find(
        (l) => !l["@_rel"] || l["@_rel"] === "alternate",
      )?.["@_href"],
      image: item["media:group"]?.["media:thumbnail"]?.["@_url"],
      imageAlt: string(item.title),
    }));
}
export function parseBluesky(data) {
  if (!Array.isArray(data.posts)) throw new Error("Expected Bluesky posts");
  return data.posts.map((post) => {
    const record = post.record || {};
    const image = post.embed?.images?.[0];
    const rkey = post.uri?.split("/").pop();
    const did = post.author?.did;
    return {
      source: "Bluesky",
      kind: image
        ? "Image"
        : post.embed?.["$type"]?.includes("video")
          ? "Video"
          : "Post",
      author:
        post.author?.displayName || post.author?.handle || "Bluesky author",
      text: record.text,
      publishedAt: record.createdAt,
      url: did && rkey ? `https://bsky.app/profile/${did}/post/${rkey}` : null,
      image: image?.fullsize || post.embed?.thumbnail,
      imageAlt: image?.alt,
      replyTo: record.reply?.parent?.uri,
      repostOf:
        record["$type"] === "app.bsky.feed.repost"
          ? record.subject?.uri
          : undefined,
      mediaKey: record.embed?.images?.[0]?.image?.ref?.["$link"],
    };
  });
}
export function parseX(data) {
  if (!Array.isArray(data.data)) {
    if (data.meta?.result_count === 0) return [];
    throw new Error("Expected X posts");
  }
  return data.data.map((post) => {
    const user = data.includes?.users?.find((u) => u.id === post.author_id);
    const media = data.includes?.media?.find(
      (m) => m.media_key === post.attachments?.media_keys?.[0],
    );
    return {
      source: "X",
      kind:
        media?.type === "video"
          ? "Video"
          : media?.type === "photo"
            ? "Image"
            : "Post",
      author: user?.name || user?.username || "X author",
      text: post.text,
      publishedAt: post.created_at,
      url: `https://x.com/${user?.username || "i"}/status/${post.id}`,
      image: media?.url || media?.preview_image_url,
      imageAlt: media?.alt_text,
      mediaKey: media?.media_key,
      replyTo: post.referenced_tweets?.find((r) => r.type === "replied_to")?.id,
      repostOf: post.referenced_tweets?.find((r) => r.type === "retweeted")?.id,
    };
  });
}
