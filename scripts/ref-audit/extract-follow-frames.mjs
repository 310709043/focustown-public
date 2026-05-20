#!/usr/bin/env node
// Extract 29 PNG frames from reference/follow.mp4 at 0.5s intervals (0..14s).
// Sister to render-reference.mjs (PR #77) — same Playwright headless pattern,
// but pointed at a <video> element instead of a reference HTML.
//
// Usage (run from repo root or anywhere — uses absolute paths):
//   node scripts/ref-audit/extract-follow-frames.mjs
//
// Output:
//   reference/uploads/follow-frames/{00..28}.png        — native-resolution stills
//   reference/uploads/follow-frames/_meta.json          — video metadata

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(__filename), "..", "..");

// pnpm flat install: playwright lives under .pnpm. Import via absolute URL so
// ESM resolution doesn't need our script to sit inside frontend/.
const PLAYWRIGHT_ENTRY = resolve(
  REPO_ROOT,
  "frontend",
  "node_modules",
  ".pnpm",
  "playwright@1.60.0",
  "node_modules",
  "playwright",
  "index.mjs"
);
const { chromium } = await import(pathToFileURL(PLAYWRIGHT_ENTRY).href);
const MP4 = resolve(REPO_ROOT, "reference", "follow.mp4");
const OUT_DIR = resolve(REPO_ROOT, "reference", "uploads", "follow-frames");
const DURATION_S = 14;
const STEP_S = 0.5;
const FRAME_COUNT = Math.floor(DURATION_S / STEP_S) + 1; // 29 (0.0, 0.5, ..., 14.0)
const SEEK_TIMEOUT_MS = 5000;

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const mp4Bytes = await readFile(MP4);
  const mp4B64 = mp4Bytes.toString("base64");
  console.log(`[load] ${MP4} (${(mp4Bytes.length / 1024).toFixed(0)} KB)`);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();

  page.on("console", (msg) => {
    if (msg.type() === "error") console.error("[browser err]", msg.text());
  });

  // Inline the mp4 as base64 data: URI to avoid file:// CORS in chromium.
  await page.setContent(`<!doctype html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;background:#000">
  <video id="v" muted preload="auto" playsinline
    src="data:video/mp4;base64,${mp4B64}"></video>
  <canvas id="c"></canvas>
</body>
</html>`);

  // Wait for metadata + first frame.
  const meta = await page.evaluate(
    () =>
      new Promise((res, rej) => {
        const v = document.getElementById("v");
        const finish = () =>
          res({
            duration: v.duration,
            w: v.videoWidth,
            h: v.videoHeight,
            canPlay: v.canPlayType("video/mp4"),
            readyState: v.readyState,
          });
        if (v.readyState >= 2) return finish();
        v.addEventListener("loadeddata", finish, { once: true });
        v.addEventListener(
          "error",
          () =>
            rej(
              new Error(
                "video error code=" +
                  (v.error && v.error.code) +
                  " msg=" +
                  (v.error && v.error.message)
              )
            ),
          { once: true }
        );
        setTimeout(() => rej(new Error("loadeddata timeout 15s")), 15000);
      })
  );

  console.log(
    `[meta] ${meta.w}x${meta.h} duration=${meta.duration.toFixed(2)}s canPlay='${meta.canPlay}' readyState=${meta.readyState}`
  );

  if (!isFinite(meta.duration) || meta.duration <= 0 || meta.w === 0) {
    throw new Error(
      `Bad video metadata: ${JSON.stringify(meta)}. Chromium likely cannot decode this codec — fall back to ffmpeg-static (see plan).`
    );
  }

  // Size canvas to native video dimensions.
  await page.evaluate(({ w, h }) => {
    const c = document.getElementById("c");
    c.width = w;
    c.height = h;
  }, meta);

  const framesIndex = [];
  for (let i = 0; i < FRAME_COUNT; i++) {
    const t = Math.min(i * STEP_S, meta.duration - 0.01);

    const b64 = await page.evaluate(
      async ({ t, timeoutMs }) => {
        const v = document.getElementById("v");
        const c = document.getElementById("c");
        await new Promise((res, rej) => {
          const onSeeked = () => {
            v.removeEventListener("seeked", onSeeked);
            res();
          };
          v.addEventListener("seeked", onSeeked);
          v.currentTime = t;
          setTimeout(() => {
            v.removeEventListener("seeked", onSeeked);
            rej(new Error("seek timeout @ t=" + t));
          }, timeoutMs);
        });
        c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
        return c.toDataURL("image/png").split(",")[1];
      },
      { t, timeoutMs: SEEK_TIMEOUT_MS }
    );

    const idx = String(i).padStart(2, "0");
    const outPath = resolve(OUT_DIR, `${idx}.png`);
    const buf = Buffer.from(b64, "base64");
    await writeFile(outPath, buf);
    console.log(`[frame ${idx}] t=${t.toFixed(1)}s -> ${(buf.length / 1024).toFixed(0)} KB`);
    framesIndex.push({ index: i, t: Number(t.toFixed(2)), file: `${idx}.png`, bytes: buf.length });
  }

  const metaPath = resolve(OUT_DIR, "_meta.json");
  await writeFile(
    metaPath,
    JSON.stringify(
      {
        source: "reference/follow.mp4",
        source_bytes: mp4Bytes.length,
        video_width: meta.w,
        video_height: meta.h,
        duration_seconds: meta.duration,
        step_seconds: STEP_S,
        frame_count: FRAME_COUNT,
        extracted_at: new Date().toISOString(),
        extractor: "scripts/ref-audit/extract-follow-frames.mjs",
        frames: framesIndex,
      },
      null,
      2
    )
  );
  console.log(`[meta] ${metaPath}`);

  await browser.close();
  console.log(`[done] ${FRAME_COUNT} frames -> ${OUT_DIR}`);
}

main().catch((e) => {
  console.error("FAIL:", e);
  process.exit(1);
});
