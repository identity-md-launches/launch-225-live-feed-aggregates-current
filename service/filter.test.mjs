import test from "node:test";
import assert from "node:assert/strict";
import { assess, curate, plainText } from "./filter.mjs";
import { parseSyndication, parseBluesky, parseX } from "./adapters.mjs";
const now = Date.parse("2026-09-27T12:00:00Z");
const post = {
  source: "X",
  kind: "Post",
  author: "Author",
  text: "Identity-MD contributors are building public tools that help the community understand the network and participate in its development.",
  url: "https://x.com/author/status/1",
  publishedAt: "2026-09-27T10:00:00Z",
};
test("substantive project coverage is accepted", () =>
  assert.ok(assess(post, now).entry));
test("ticker-only content, unrelated coverage and incidental mentions are rejected", () => {
  assert.equal(
    assess({ ...post, text: "$IMD $IMD 🚀" }, now).reason,
    "off-topic",
  );
  assert.equal(
    assess({ ...post, text: "Identity-MD is cool" }, now).reason,
    "low-effort",
  );
  assert.equal(
    assess(
      {
        ...post,
        text: "The weather is clear across many countries and the forecast shows a sunny weekend ahead.",
      },
      now,
    ).reason,
    "off-topic",
  );
  assert.equal(
    assess(
      {
        ...post,
        text:
          "A completely unrelated technology story. ".repeat(25) +
          "Also Identity-MD.",
      },
      now,
    ).reason,
    "off-topic",
  );
});
test("replies, native reposts and manually copied RT posts are rejected", () => {
  for (const patch of [
    { replyTo: "parent" },
    { repostOf: "original" },
    { text: "RT @author: " + post.text },
  ])
    assert.equal(assess({ ...post, ...patch }, now).reason, "reply-or-repost");
});
test("project memes and single images survive short captions", () => {
  assert.ok(
    assess(
      {
        ...post,
        kind: "Image",
        text: "$IMD",
        image: "https://media.example/meme.png",
      },
      now,
    ).entry,
  );
  assert.ok(
    assess(
      {
        ...post,
        kind: "Image",
        text: "",
        image: "https://media.example/meme.png",
        imageAlt: "Identity-MD swarm meme",
      },
      now,
    ).entry,
  );
  assert.equal(
    assess(
      {
        ...post,
        kind: "Image",
        text: "An unrelated meme",
        image: "https://media.example/other.png",
      },
      now,
    ).reason,
    "off-topic",
  );
});
test("obvious spam remains rejected even with an image", () => {
  assert.equal(
    assess(
      {
        ...post,
        text: post.text + " Claim your free airdrop now.",
        image: "https://media.example/scam.png",
      },
      now,
    ).reason,
    "spam",
  );
  assert.equal(
    assess(
      {
        ...post,
        text: post.text + " #one #two #three #four #five #six #seven",
      },
      now,
    ).reason,
    "spam",
  );
});
test("duplicates retain the earliest original across source, punctuation and tracking variations", () => {
  const duplicate = {
    ...post,
    source: "Bluesky",
    url: "https://bsky.app/profile/a/post/b",
    publishedAt: "2026-09-27T11:00:00Z",
    text: post.text.toUpperCase() + "!",
  };
  const result = curate(
    [duplicate, post, { ...post, url: post.url + "?utm_source=example" }],
    { now },
  );
  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].url, post.url);
  assert.equal(result.rejected.duplicate, 2);
});
test("repeated media keys are rejected without rejecting distinct memes", () => {
  const first = {
    ...post,
    text: "$IMD",
    kind: "Image",
    image: "https://media.example/a.png",
    mediaKey: "same",
  };
  const second = {
    ...first,
    url: "https://x.com/author/status/2",
    image: "https://cdn.example/b.png",
    publishedAt: "2026-09-27T11:00:00Z",
  };
  const third = {
    ...second,
    url: "https://x.com/author/status/3",
    image: "https://cdn.example/c.png",
    mediaKey: "different",
  };
  assert.equal(curate([first, second, third], { now }).entries.length, 2);
});
test("unsafe URLs, invalid timestamps, future entries and expired entries do not publish", () => {
  for (const patch of [
    { url: "javascript:alert(1)" },
    { url: "https://user:secret@example.com" },
    { publishedAt: "invalid" },
    { publishedAt: "2027-01-01" },
  ])
    assert.equal(assess({ ...post, ...patch }, now).reason, "invalid");
  assert.equal(
    curate([{ ...post, publishedAt: "2020-01-01" }], { now }).entries.length,
    0,
  );
  assert.equal(
    assess({ ...post, image: "data:image/svg+xml,bad" }, now).entry.image,
    undefined,
  );
});
test("HTML is converted to inert text", () =>
  assert.equal(
    plainText("<p>Hello &amp; world</p><script>alert(1)</script>"),
    "Hello & world",
  ));
test("RSS, Atom and JSON Feed preserve source content", () => {
  const rss = parseSyndication(
    "<rss><channel><title>Journal</title><item><title>Identity-MD</title><link>https://example.com/1</link><pubDate>Sun, 27 Sep 2026 10:00:00 GMT</pubDate><description><![CDATA[<p>Full description</p>]]></description></item></channel></rss>",
    {},
  );
  assert.equal(rss[0].text, "Full description");
  assert.equal(rss[0].author, "Journal");
  const atom = parseSyndication(
    '<feed><title>Videos</title><entry><title>Walkthrough</title><published>2026-09-27T10:00:00Z</published><link rel="alternate" href="https://example.com/v"/><content>Video notes</content></entry></feed>',
    { origin: "YouTube", kind: "Video" },
  );
  assert.equal(atom[0].url, "https://example.com/v");
  assert.equal(atom[0].kind, "Video");
  const json = parseSyndication(
    JSON.stringify({
      title: "Journal",
      items: [
        {
          url: post.url,
          date_published: post.publishedAt,
          content_text: post.text,
        },
      ],
    }),
    {},
    "application/feed+json",
  );
  assert.equal(json[0].text, post.text);
  assert.throws(() =>
    parseSyndication(
      '<!DOCTYPE rss [<!ENTITY x SYSTEM "file:///etc/passwd">]><rss/>',
      {},
    ),
  );
});
test("social adapters preserve reply and repost metadata for filtering", () => {
  const bsky = parseBluesky({
    posts: [
      {
        uri: "at://did:plc:123/app.bsky.feed.post/abc",
        author: { did: "did:plc:123", handle: "test" },
        record: {
          text: post.text,
          createdAt: post.publishedAt,
          reply: { parent: { uri: "parent" } },
        },
      },
    ],
  });
  assert.equal(bsky[0].replyTo, "parent");
  assert.ok(bsky[0].url.endsWith("/abc"));
  const x = parseX({
    data: [
      {
        id: "1",
        text: post.text,
        created_at: post.publishedAt,
        referenced_tweets: [{ type: "retweeted", id: "2" }],
      },
    ],
  });
  assert.equal(x[0].repostOf, "2");
  assert.deepEqual(parseX({ meta: { result_count: 0 } }), []);
});
