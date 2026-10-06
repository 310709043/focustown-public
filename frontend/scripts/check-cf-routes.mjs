// Exercise the built Worker, not `next dev`: static routes can pass Next.js
// tests while failing in OpenNext when their build-time cache is unavailable.
const preview = process.env.CF_PREVIEW_URL || "http://127.0.0.1:8788";
const site = process.env.NEXT_PUBLIC_SITE_URL || "https://www.lowbatterytown.com";
let sitemap;
for (let attempt = 0; attempt < 60; attempt++) {
  try {
    const response = await fetch(`${preview}/sitemap.xml`, { signal: AbortSignal.timeout(3000) });
    if (response.ok) { sitemap = await response.text(); break; }
  } catch { /* Wrangler may still be starting. */ }
  await new Promise((resolve) => setTimeout(resolve, 500));
}
if (!sitemap) throw new Error("Worker preview did not start or serve its sitemap");
const paths = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, url]) => new URL(url).pathname);
if (!paths.includes("/zh-TW/guide/wootalk-alternative")) throw new Error("New guide missing from sitemap");
for (const path of paths) {
  const response = await fetch(`${preview}${path}`, { signal: AbortSignal.timeout(10000) });
  if (response.status !== 200) throw new Error(`${path}: HTTP ${response.status}`);
  const html = await response.text();
  if (!html.includes(`<link rel="canonical" href="${site}${path}"`)) throw new Error(`${path}: wrong canonical`);
  if (!html.includes("application/ld+json")) throw new Error(`${path}: missing structured data`);
  const scriptPolicy = response.headers.get("content-security-policy")?.match(/script-src ([^;]+)/)?.[1];
  const nonce = scriptPolicy?.match(/'nonce-([^']+)'/)?.[1];
  if (!nonce || scriptPolicy.includes("'unsafe-inline'")) throw new Error(`${path}: missing strict script nonce policy`);
  for (const [script] of html.matchAll(/<script\b[^>]*>/g)) {
    if (!script.includes(`nonce="${nonce}"`)) throw new Error(`${path}: script nonce does not match header`);
  }
  console.log(`OK ${path}`);
}
for (const locale of ["zh-TW", "en"]) {
  const response = await fetch(`${preview}/${locale}/guide/not-an-article`, { signal: AbortSignal.timeout(10000) });
  if (response.status !== 404) throw new Error(`${locale}: unknown article must return 404`);
}
console.log(`Worker check passed: ${paths.length} indexable pages and unknown-article 404s.`);
