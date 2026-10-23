// Reads and checks a prepared post: social/posts/<slug>/post.json plus the
// text and media files it names. Pure apart from reading the folder.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const LIMITS = {
  igCaption: 2200,
  igHashtags: 5, // Instagram's cap per post since December 2025
  igCarouselMin: 2,
  igCarouselMax: 10,
  threadsText: 500,
  topicTag: 50,
};

const IMAGE = /\.(jpe?g)$/i; // Instagram only takes JPEG
const THREADS_IMAGE = /\.(jpe?g|png)$/i;
const VIDEO = /\.(mp4|mov)$/i;

export const countHashtags = (text) => (text.match(/(^|\s)#[^\s#]+/gu) ?? []).length;
export const charLength = (text) => [...text].length;

function readText(dir, entry, key) {
  const file = entry[`${key}_file`];
  if (file) return readFileSync(join(dir, file), "utf8").trim();
  return (entry[key] ?? "").trim();
}

/** Load post.json and resolve *_file entries into text. */
export function loadPost(dir) {
  const spec = JSON.parse(readFileSync(join(dir, "post.json"), "utf8"));
  const post = { status: spec.status ?? "draft" };
  if (spec.instagram) {
    post.instagram = { ...spec.instagram, caption: readText(dir, spec.instagram, "caption") };
  }
  if (spec.threads) {
    post.threads = {
      ...spec.threads,
      text: readText(dir, spec.threads, "text"),
      reply: readText(dir, spec.threads, "reply"),
    };
  }
  return post;
}

function checkMedia(dir, file, pattern, label, errors) {
  if (!file) errors.push(`${label}: missing file name`);
  else if (!pattern.test(file)) errors.push(`${label}: ${file} has an unsupported type`);
  else if (!existsSync(join(dir, file))) errors.push(`${label}: ${file} not found`);
}

function checkInstagram(dir, ig, errors) {
  if (charLength(ig.caption) > LIMITS.igCaption) errors.push(`instagram: caption longer than ${LIMITS.igCaption}`);
  if (countHashtags(ig.caption) > LIMITS.igHashtags) errors.push(`instagram: more than ${LIMITS.igHashtags} hashtags`);
  if (ig.type === "reel") {
    checkMedia(dir, ig.video, VIDEO, "instagram video", errors);
    if (ig.cover) checkMedia(dir, ig.cover, IMAGE, "instagram cover", errors);
  } else if (ig.type === "image") {
    checkMedia(dir, ig.image, IMAGE, "instagram image", errors);
  } else if (ig.type === "carousel") {
    const images = ig.images ?? [];
    if (images.length < LIMITS.igCarouselMin || images.length > LIMITS.igCarouselMax) {
      errors.push(`instagram: a carousel needs ${LIMITS.igCarouselMin}-${LIMITS.igCarouselMax} images`);
    }
    images.forEach((file, i) => checkMedia(dir, file, IMAGE, `instagram image ${i + 1}`, errors));
  } else {
    errors.push(`instagram: unknown type "${ig.type}" (reel, image or carousel)`);
  }
}

function checkThreads(dir, th, errors) {
  if (!th.text) errors.push("threads: text is empty");
  if (charLength(th.text) > LIMITS.threadsText) errors.push(`threads: text longer than ${LIMITS.threadsText}`);
  if (charLength(th.reply) > LIMITS.threadsText) errors.push(`threads: reply longer than ${LIMITS.threadsText}`);
  if (th.video && th.image) errors.push("threads: use either video or image, not both");
  if (th.video) checkMedia(dir, th.video, VIDEO, "threads video", errors);
  if (th.image) checkMedia(dir, th.image, THREADS_IMAGE, "threads image", errors);
  const tag = th.topic_tag;
  if (tag !== undefined && (!tag || charLength(tag) > LIMITS.topicTag || /[.&]/.test(tag))) {
    errors.push(`threads: topic_tag must be 1-${LIMITS.topicTag} characters without "." or "&"`);
  }
}

/** Returns a list of problems; empty means the post can be sent. */
export function validatePost(dir, post) {
  const errors = [];
  if (!post.instagram && !post.threads) errors.push("post has neither instagram nor threads");
  if (post.instagram) checkInstagram(dir, post.instagram, errors);
  if (post.threads) checkThreads(dir, post.threads, errors);
  return errors;
}

/** Platforms already recorded in published.json, so a re-run never posts twice. */
export function loadPublished(dir) {
  const file = join(dir, "published.json");
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
}

export const mediaUrl = (base, dir, file) => `${base.replace(/\/$/, "")}/${dir.replace(/^\.?\//, "")}/${file}`;
