#!/usr/bin/env node
// Screenshot /town at each of the 5 scenes that appear in reference/follow.mp4.
// Pair output with reference/uploads/follow-frames/* for the visual diff.
//
// Usage (dev server must already be running at :3000):
//   node scripts/ref-audit/screenshot-town-scenes.mjs

import { mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(__filename), "..", "..");

const PLAYWRIGHT_ENTRY = resolve(
  REPO_ROOT,
  "frontend",
  "node_modules",
  ".pnpm",
  "playwright@1.60.0",
  "node_modules",
  "playwright",
  "index.mjs",
);
const { chromium } = await import(pathToFileURL(PLAYWRIGHT_ENTRY).href);

const OUT_DIR = resolve(REPO_ROOT, "reference", "uploads", "town-scene-shots");
const PORT = process.env.PORT || "3000";
const URL_BASE = `http://localhost:${PORT}/zh-TW/town`;

// (scene-key, paired follow-frame for side-by-side diff)
const SCENES = [
  { key: "day", ref: "00.png" },
  { key: "dusk", ref: "12.png" },
  { key: "night", ref: "16.png" },
  { key: "midnight", ref: "20.png" },
  { key: "dawn", ref: "24.png" },
];

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1106, height: 720 },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();

  page.on("console", (msg) => {
    if (msg.type() === "error") console.error("[browser err]", msg.text());
  });

  console.log(`[open] ${URL_BASE}`);
  await page.goto(URL_BASE, { waitUntil: "domcontentloaded", timeout: 30_000 });

  // sceneStore.ts attaches window.__sceneStore on first import (any client
  // component that uses it). Poll for it rather than relying on networkidle,
  // because backend WS retries keep the network busy indefinitely.
  await page.waitForFunction(() => Boolean((window /** @type {any} */)
    .__sceneStore), null, { timeout: 15_000 });
  // Give RAF / drift loops a beat to settle.
  await page.waitForTimeout(800);

  const results = [];
  for (const { key, ref } of SCENES) {
    // Force scene via the zustand store. Since the store is created at module
    // load and the only handle we have from outside is via re-importing, we
    // dispatch a CustomEvent the page can attach to; if that hook doesn't
    // exist, fall back to clicking nothing and just sampling current scene.
    //
    // Lightweight approach: reach into React's internal singleton by importing
    // the dev module map. Easier: postMessage and let a temp window listener
    // we install do setState. Easiest: use page.evaluate to import the store
    // from the running module graph via dynamic import.
    await page.evaluate((sceneKey) => {
      // sceneStore.ts attaches itself to window.__sceneStore in dev mode.
      const w = /** @type {any} */ (window);
      if (!w.__sceneStore) {
        throw new Error("window.__sceneStore not present — sceneStore dev hook missing");
      }
      w.__sceneStore.setState({ current: sceneKey, orderIdx: 0 });
    }, key);

    // Sky has a 4s gradient transition; cloud palettes change per scene; give
    // a buffer to settle visually.
    await page.waitForTimeout(4500);

    const outPath = resolve(OUT_DIR, `${key}.png`);
    await page.screenshot({ path: outPath, fullPage: false });
    const refPath = `reference/uploads/follow-frames/${ref}`;
    console.log(`[shot] scene=${key} -> town-scene-shots/${key}.png   (cf. ${refPath})`);
    results.push({ key, file: `${key}.png`, ref });
  }

  await writeFile(
    resolve(OUT_DIR, "_index.json"),
    JSON.stringify(
      {
        captured_at: new Date().toISOString(),
        url: URL_BASE,
        viewport: { w: 1106, h: 720 },
        pairs: results,
      },
      null,
      2,
    ),
  );

  await browser.close();
  console.log(`[done] ${results.length} scene shots -> ${OUT_DIR}`);
}

main().catch((e) => {
  console.error("FAIL:", e);
  process.exit(1);
});
