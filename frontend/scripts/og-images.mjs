/**
 * Share images for the guide and its articles (public/lbt/og/<locale>/<slug>.jpg,
 * 1200 x 630): the night sky of og-lbt.png with the page's headline (`heading`,
 * else `title`). Run after
 * adding an article or changing a title:
 *
 *   npm pack @fontsource/noto-sans-tc@5 && tar xzf fontsource-noto-sans-tc-*.tgz
 *   node scripts/og-images.mjs --fonts ./package [slug]
 *   (CHROMIUM_PATH=/path/to/chromium if Playwright has no browser of its own)
 *
 * Needs Playwright with Chromium (pre-installed in CI images and cloud
 * sessions). The CJK font is only needed here, never shipped to visitors.
 */
import { createRequire } from "node:module";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const F = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fontsArg = process.argv.indexOf("--fonts");
if (fontsArg < 0) throw new Error("Pass --fonts <unpacked @fontsource/noto-sans-tc package dir>");
const FONTS = resolve(process.argv[fontsArg + 1]);
const S = tmpdir();
const mark = readFileSync(F + "/public/brand/lbt-mark.svg", "utf8").replace('<rect x="21" y="2" width="25" height="13" rx="4" fill="#141c31"/>','<rect x="21" y="2" width="25" height="13" rx="4" fill="#f7f1e8"/>').replaceAll('stroke="#141c31"','stroke="#f7f1e8"');
const css700 = readFileSync(FONTS + "/700.css","utf8").replaceAll("url(./files/", "url(file://" + FONTS + "/files/");
const css500 = readFileSync(FONTS + "/500.css","utf8").replaceAll("url(./files/", "url(file://" + FONTS + "/files/");
const quick = "file://" + F + "/assets/fonts/quicksand-latin-700-normal.woff2";
const mono = "file://" + F + "/assets/fonts/dm-mono-latin-500-normal.woff2";
const kicker = { "zh-TW": "小鎮指南", en: "Town guide" };
function split(title) {
  const m = title.match(/^(.+?[？?：:])\s*(.+)$/);
  return m ? [m[1].replace(/[：:]$/, ""), m[2].replace(/｜.*$/, "")] : [title, ""];
}
function page(locale, title) {
  const [main, sub] = split(title);
  const stars = [[120,90],[300,150],[420,60],[760,60],[980,80],[1080,200],[860,170],[560,110]].map(([x,y])=>'<i style="left:'+x+'px;top:'+y+'px"></i>').join("");
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><style>${css700}${css500}
@font-face{font-family:Quicksand;src:url(${quick});font-weight:700}
@font-face{font-family:DMMono;src:url(${mono});font-weight:500}
html,body{margin:0}
body{width:1200px;height:630px;overflow:hidden;position:relative;background:radial-gradient(ellipse 60% 45% at 50% 105%,rgba(255,214,150,.16),transparent 70%),linear-gradient(180deg,#1f2b48 0%,#141c31 60%,#10172a 100%);color:#f7f1e8;font-family:"Noto Sans TC",sans-serif}
i{position:absolute;width:3px;height:3px;border-radius:50%;background:#cfd6e6;opacity:.55}
.lamp{position:absolute;bottom:0;width:3px;height:140px;background:#2c3b5c}
.lamp::before{content:"";position:absolute;left:-10px;top:-12px;width:22px;height:22px;border-radius:50%;background:#ffd98a;box-shadow:0 0 40px 14px rgba(255,217,138,.28)}
.brand{position:absolute;left:96px;top:70px;display:flex;align-items:center;gap:14px;font:700 34px Quicksand;letter-spacing:.5px}
.brand svg{height:44px;width:auto}
.wrap{position:absolute;left:96px;right:96px;top:170px;bottom:120px;display:flex;flex-direction:column;justify-content:center;gap:22px}
.kicker{font-weight:500;font-size:26px;color:#ffd98a;letter-spacing:2px}
.main{font-weight:700;font-size:${main.length>16&&locale!=="en"?58:locale==="en"?(main.length>34?54:64):66}px;line-height:1.22;text-wrap:balance}
.sub{font-weight:500;font-size:${locale==="en"?34:38}px;line-height:1.35;color:#c9d1e3;text-wrap:balance}
.url{position:absolute;left:0;right:0;bottom:44px;text-align:center;font:500 20px DMMono;letter-spacing:4px;color:#8f9bb8}
</style></head><body>${stars}<div class="lamp" style="left:44px"></div><div class="lamp" style="right:44px"></div>
<div class="brand">${mark}<span>LowBatteryTown</span></div>
<div class="wrap"><div class="kicker">${kicker[locale]}</div><div class="main">${main}</div>${sub?'<div class="sub">'+sub+'</div>':""}</div>
<div class="url">LOWBATTERYTOWN.COM</div></body></html>`;
}
// CHROMIUM_PATH: a Chromium binary when the installed Playwright has none of its own.
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
const p = await ctx.newPage();
const only = process.argv.slice(2).filter((a, i, all) => a !== "--fonts" && all[i - 1] !== "--fonts")[0];
for (const locale of ["zh-TW", "en"]) {
  const m = JSON.parse(readFileSync(F + "/messages/" + locale + "/lbt.json", "utf8"));
  const items = { guide: m.guide.title, ...Object.fromEntries(Object.entries(m.articles.items).map(([k, v]) => [k, v.heading ?? v.title])) };
  mkdirSync(F + "/public/lbt/og/" + locale, { recursive: true });
  for (const [slug, title] of Object.entries(items)) {
    if (only && only !== slug) continue;
    writeFileSync(S + "/lbt-og-page.html", page(locale, title));
    await p.goto("file://" + S + "/lbt-og-page.html", { waitUntil: "load" });
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(150);
    await p.screenshot({ path: F + "/public/lbt/og/" + locale + "/" + slug + ".jpg", type: "jpeg", quality: 88 });
  }
}
await browser.close();
