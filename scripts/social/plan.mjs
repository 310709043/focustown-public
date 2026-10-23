#!/usr/bin/env node
// Given changed post.json paths, print the post folders that are marked
// "ready" and still have something left to publish (one per line).
//
//   node scripts/social/plan.mjs social/posts/a/post.json social/posts/b/post.json
import { existsSync } from "node:fs";
import { dirname } from "node:path";

import { loadPost, loadPublished } from "./postSpec.mjs";

export function pending(dir) {
  if (!existsSync(`${dir}/post.json`)) return false;
  const post = loadPost(dir);
  if (post.status !== "ready") return false;
  const done = loadPublished(dir);
  const threadsDone = done.threads && (done.threads_reply || !post.threads?.reply);
  return Boolean((post.instagram && !done.instagram) || (post.threads && !threadsDone));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dirs = [...new Set(process.argv.slice(2).map((p) => dirname(p)))];
  for (const dir of dirs.filter(pending)) console.log(dir);
}
