// node --test scripts/social/social.test.mjs
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { instagram, MetaError, threads } from "./meta.mjs";
import { pending } from "./plan.mjs";
import { countHashtags, loadPost, mediaUrl, validatePost } from "./postSpec.mjs";

function postDir(spec, files = {}) {
  const dir = mkdtempSync(join(tmpdir(), "social-"));
  writeFileSync(join(dir, "post.json"), JSON.stringify(spec));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
  return dir;
}

const reelSpec = {
  status: "ready",
  instagram: { type: "reel", video: "reel.mp4", cover: "cover.jpg", caption_file: "ig.txt" },
  threads: { video: "reel.mp4", text_file: "th.txt", topic_tag: "颱風假", reply: "連結 https://example.com" },
};
const reelFiles = { "reel.mp4": "x", "cover.jpg": "x", "ig.txt": "貓 #a #b\n", "th.txt": "颱風假在家 🐈\n" };

test("loadPost resolves text files and trims them", () => {
  const post = loadPost(postDir(reelSpec, reelFiles));
  assert.equal(post.instagram.caption, "貓 #a #b");
  assert.equal(post.threads.text, "颱風假在家 🐈");
  assert.equal(post.threads.reply, "連結 https://example.com");
});

test("a complete reel post validates", () => {
  const dir = postDir(reelSpec, reelFiles);
  assert.deepEqual(validatePost(dir, loadPost(dir)), []);
});

test("more than five Instagram hashtags is rejected", () => {
  const dir = postDir(reelSpec, { ...reelFiles, "ig.txt": "#1 #2 #3 #4 #5 #6" });
  assert.match(validatePost(dir, loadPost(dir)).join(), /more than 5 hashtags/);
});

test("Threads text over 500 characters is rejected, counting emoji as one", () => {
  const ok = postDir(reelSpec, { ...reelFiles, "th.txt": "🐈".repeat(500) });
  assert.deepEqual(validatePost(ok, loadPost(ok)), []);
  const long = postDir(reelSpec, { ...reelFiles, "th.txt": "貓".repeat(501) });
  assert.match(validatePost(long, loadPost(long)).join(), /longer than 500/);
});

test("missing media and PNG images for Instagram are reported", () => {
  const spec = { status: "ready", instagram: { type: "carousel", images: ["a.png", "b.jpg"], caption: "x" } };
  const errors = validatePost(postDir(spec), loadPost(postDir(spec)));
  assert.match(errors.join("\n"), /a\.png has an unsupported type/);
  assert.match(errors.join("\n"), /b\.jpg not found/);
});

test("topic tags with a period are rejected", () => {
  const spec = { status: "ready", threads: { text: "hi", topic_tag: "a.b" } };
  const dir = postDir(spec);
  assert.match(validatePost(dir, loadPost(dir)).join(), /topic_tag/);
});

test("hashtags are counted only at word starts", () => {
  assert.equal(countHashtags("#颱風假 #台灣\n文字#不算 #三花貓"), 3);
});

test("mediaUrl joins the base and the post folder", () => {
  assert.equal(mediaUrl("https://raw.example/r/sha/", "social/posts/a", "reel.mp4"), "https://raw.example/r/sha/social/posts/a/reel.mp4");
});

test("pending skips drafts and posts that are fully published", () => {
  const draft = postDir({ ...reelSpec, status: "draft" }, reelFiles);
  assert.equal(pending(draft), false);
  const ready = postDir(reelSpec, reelFiles);
  assert.equal(pending(ready), true);
  writeFileSync(join(ready, "published.json"), JSON.stringify({ instagram: {}, threads: {}, threads_reply: {} }));
  assert.equal(pending(ready), false);
});

/** Fake Meta API: answers by path, records every call. */
function fakeMeta(routes) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const u = new URL(url);
    const params = Object.fromEntries(init.body ? new URLSearchParams(init.body) : u.searchParams);
    calls.push({ method: init.method, path: u.pathname, params });
    const key = `${init.method} ${u.pathname.replace(/^\/v[\d.]+/, "")}`;
    const answer = routes[key];
    const data = typeof answer === "function" ? answer(params) : answer;
    return { ok: !data?.error, status: data?.error ? 400 : 200, json: async () => data ?? {} };
  };
  return { calls, options: { fetchImpl, sleep: async () => {}, intervalMs: 0, timeoutMs: 1000 } };
}

test("instagram reel: container, wait, publish, permalink", async () => {
  let polls = 0;
  const meta = fakeMeta({
    "GET /me": { user_id: "17", username: "lowbatterytown" },
    "POST /17/media": { id: "c1" },
    "GET /c1": () => ({ status_code: ++polls < 2 ? "IN_PROGRESS" : "FINISHED" }),
    "POST /17/media_publish": { id: "m1" },
    "GET /m1": { permalink: "https://instagram.com/reel/x" },
  });
  const ig = instagram("secret-token", meta.options);
  await ig.me();
  const result = await ig.reel({ videoUrl: "https://v/reel.mp4", coverUrl: "https://v/c.jpg", caption: "貓" });
  assert.deepEqual(result, { id: "m1", permalink: "https://instagram.com/reel/x" });
  const create = meta.calls.find((c) => c.path.endsWith("/17/media"));
  assert.equal(create.params.media_type, "REELS");
  assert.equal(create.params.cover_url, "https://v/c.jpg");
  assert.equal(create.params.share_to_feed, "true");
  assert.equal(polls, 2);
  assert.ok(meta.calls.every((c) => c.params.access_token === "secret-token"));
});

test("instagram carousel creates one child per image", async () => {
  let n = 0;
  const meta = fakeMeta({
    "GET /me": { user_id: "17", username: "u" },
    "POST /17/media": (p) => ({ id: p.media_type === "CAROUSEL" ? "parent" : `child${++n}` }),
    "GET /parent": { status_code: "FINISHED" },
    "POST /17/media_publish": { id: "m2" },
    "GET /m2": { permalink: "p" },
  });
  const ig = instagram("t", meta.options);
  await ig.me();
  await ig.carousel({ imageUrls: ["a", "b", "c"], caption: "x" });
  const parent = meta.calls.find((c) => c.params.media_type === "CAROUSEL");
  assert.equal(parent.params.children, "child1,child2,child3");
});

test("threads video post with topic tag, then a reply under it", async () => {
  const meta = fakeMeta({
    "GET /me": { id: "9", username: "lbt" },
    "POST /9/threads": (p) => ({ id: p.reply_to_id ? "c2" : "c1" }),
    "GET /c1": { status: "FINISHED" },
    "GET /c2": { status: "FINISHED" },
    "POST /9/threads_publish": (p) => ({ id: p.creation_id === "c1" ? "t1" : "t2" }),
    "GET /t1": { permalink: "https://threads.com/t1" },
    "GET /t2": { permalink: "https://threads.com/t2" },
  });
  const th = threads("t", meta.options);
  await th.me();
  const main = await th.thread({ text: "颱風假", videoUrl: "https://v/reel.mp4", topicTag: "颱風假" });
  const reply = await th.reply({ replyToId: main.id, text: "連結" });
  const [first, second] = meta.calls.filter((c) => c.path.endsWith("/9/threads"));
  assert.equal(first.params.media_type, "VIDEO");
  assert.equal(first.params.topic_tag, "颱風假");
  assert.equal(second.params.reply_to_id, "t1");
  assert.equal(reply.permalink, "https://threads.com/t2");
});

test("API errors surface Meta's message and never the token", async () => {
  const meta = fakeMeta({ "GET /me": { error: { message: "Invalid OAuth access token." } } });
  const err = await instagram("secret-token", meta.options).me().catch((e) => e);
  assert.ok(err instanceof MetaError);
  assert.match(err.message, /Invalid OAuth access token/);
  assert.doesNotMatch(err.message, /secret-token/);
});

test("a container that errors stops the publish", async () => {
  const meta = fakeMeta({
    "GET /me": { id: "9", username: "lbt" },
    "POST /9/threads": { id: "c1" },
    "GET /c1": { status: "ERROR", error_message: "video too long" },
  });
  const th = threads("t", meta.options);
  await th.me();
  await assert.rejects(th.thread({ text: "x", videoUrl: "v" }), /video too long/);
  assert.ok(!meta.calls.some((c) => c.path.endsWith("threads_publish")));
});
