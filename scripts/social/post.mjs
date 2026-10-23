#!/usr/bin/env node
// Publish prepared posts to Instagram and Threads.
//
//   node scripts/social/post.mjs [--dry-run] <social/posts/slug> ...
//
// Env: IG_ACCESS_TOKEN, THREADS_ACCESS_TOKEN (either may be absent if the post
// does not use that platform), MEDIA_BASE_URL (a public URL the repository
// files are served from, e.g. raw.githubusercontent.com/<repo>/<sha>).
// --dry-run checks the post, the tokens and the media URLs but sends nothing.
// Each platform that succeeds is written to <slug>/published.json at once, so
// a re-run never posts it twice.
import { appendFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { instagram, threads } from "./meta.mjs";
import { loadPost, loadPublished, mediaUrl, validatePost } from "./postSpec.mjs";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const dirs = args.filter((a) => !a.startsWith("--"));
const base = process.env.MEDIA_BASE_URL ?? "";

const log = (line) => {
  console.log(line);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n`);
};

async function reachable(url) {
  const res = await fetch(url, { method: "HEAD" });
  if (!res.ok) throw new Error(`media not reachable (${res.status}): ${url}`);
  return res.headers.get("content-type");
}

function record(dir, platform, result) {
  const published = loadPublished(dir);
  published[platform] = { ...result, at: new Date().toISOString() };
  writeFileSync(join(dir, "published.json"), `${JSON.stringify(published, null, 2)}\n`);
}

async function sendInstagram(dir, ig) {
  const client = instagram(process.env.IG_ACCESS_TOKEN);
  const account = await client.me();
  const url = (file) => mediaUrl(base, dir, file);
  const files = ig.type === "reel" ? [ig.video, ig.cover].filter(Boolean) : ig.type === "image" ? [ig.image] : ig.images;
  for (const file of files) log(`  - ${file}: ${await reachable(url(file))}`);
  if (dryRun) return log(`  instagram @${account.username}: ok (dry run, ${ig.type})`);
  const result =
    ig.type === "reel"
      ? await client.reel({ videoUrl: url(ig.video), coverUrl: ig.cover && url(ig.cover), caption: ig.caption, shareToFeed: ig.share_to_feed ?? true })
      : ig.type === "image"
        ? await client.image({ imageUrl: url(ig.image), caption: ig.caption })
        : await client.carousel({ imageUrls: ig.images.map(url), caption: ig.caption });
  record(dir, "instagram", result);
  log(`  instagram @${account.username}: ${result.permalink}`);
}

async function sendThreads(dir, th, published) {
  const client = threads(process.env.THREADS_ACCESS_TOKEN);
  const account = await client.me();
  const url = (file) => mediaUrl(base, dir, file);
  for (const file of [th.video, th.image].filter(Boolean)) log(`  - ${file}: ${await reachable(url(file))}`);
  if (dryRun) return log(`  threads @${account.username}: ok (dry run)`);
  let main = published.threads;
  if (!main) {
    main = await client.thread({
      text: th.text,
      videoUrl: th.video && url(th.video),
      imageUrl: th.image && url(th.image),
      topicTag: th.topic_tag,
    });
    record(dir, "threads", main);
    log(`  threads @${account.username}: ${main.permalink}`);
  }
  if (th.reply && !published.threads_reply) {
    const reply = await client.reply({ replyToId: main.id, text: th.reply });
    record(dir, "threads_reply", reply);
    log(`  threads reply: ${reply.permalink}`);
  }
}

async function run(dir) {
  log(`### ${dir}${dryRun ? " (dry run)" : ""}`);
  const post = loadPost(dir);
  const errors = validatePost(dir, post);
  if (errors.length) throw new Error(errors.join("\n"));
  const published = loadPublished(dir);
  if (post.instagram && !process.env.IG_ACCESS_TOKEN) throw new Error("IG_ACCESS_TOKEN is not set");
  if (post.threads && !process.env.THREADS_ACCESS_TOKEN) throw new Error("THREADS_ACCESS_TOKEN is not set");
  if (post.instagram && !published.instagram) await sendInstagram(dir, post.instagram);
  if (post.threads && !(published.threads && (published.threads_reply || !post.threads.reply))) {
    await sendThreads(dir, post.threads, published);
  }
}

if (!dirs.length) {
  console.error("usage: post.mjs [--dry-run] <social/posts/slug> ...");
  process.exit(2);
}
if (!base) {
  console.error("MEDIA_BASE_URL is not set");
  process.exit(2);
}
let failed = false;
for (const dir of dirs) {
  try {
    await run(dir);
  } catch (err) {
    failed = true;
    log(`  failed: ${err.message}`);
  }
}
process.exit(failed ? 1 : 0);
