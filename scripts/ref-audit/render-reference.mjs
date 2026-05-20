#!/usr/bin/env node
// Render each reference HTML at its initial landing state (no SPA navigation).
// Assumes a local http.server is already running on the given PORT in the
// reference dir (the script does NOT start one — that lets us cancel cleanly).
//
// Usage:
//   PORT=8765 OUT=docs/qa/ref-renders \
//   node scripts/ref-audit/render-reference.mjs

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const PORT = process.env.PORT ?? "8765";
const OUT = resolve(process.env.OUT ?? "docs/qa/ref-renders");
const BASE = `http://localhost:${PORT}`;

const TARGETS = [
  { stem: "FocusTown", path: "/FocusTown.html" },
  { stem: "FocusTown-standalone-src", path: "/FocusTown-standalone-src.html" },
  { stem: "FocusTown-Standalone-bundled", path: "/FocusTown%20-%20Standalone.html" },
  { stem: "cloud-preview", path: "/cloud-preview.html" },
];

async function main() {
  await mkdir(OUT, { recursive: true });

  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 924, height: 540 },
    deviceScaleFactor: 1,
  });

  for (const t of TARGETS) {
    const page = await ctx.newPage();
    const url = `${BASE}${t.path}`;
    const out = `${OUT}/${t.stem}__initial.png`;
    console.log(`[render] ${t.stem} -> ${url}`);
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
      await page.addStyleTag({
        content: "*,*::before,*::after{animation:none!important;transition:none!important}",
      });
      await page.waitForTimeout(1500); // let React mount + fonts settle
      await page.screenshot({ path: out, fullPage: false });
      console.log(`  ok -> ${out}`);
    } catch (err) {
      console.error(`  FAIL: ${err.message}`);
      try {
        await page.screenshot({ path: out.replace(".png", "__error.png") });
      } catch {}
    }
    await page.close();
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
