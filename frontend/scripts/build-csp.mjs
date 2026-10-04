import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { analyticsInitScript } from "../lib/config/analyticsScript.mjs";

// The edge adds a fresh nonce after OpenNext has rendered each response.
// Only afterInteractive analytics needs a stable build-time hash.
const routes = ["", "/demo", "/guide", "/policies/privacy", "/policies/terms", "/policies/guidelines"];
const manifest = {};
const hash = text => `'sha256-${createHash("sha256").update(text).digest("base64")}'`;
for (const locale of ["zh-TW", "en"]) {
  for (const route of routes) {
    const path = `/${locale}${route}`;
    const hashes = new Set();
    if (process.env.NEXT_PUBLIC_GA_ID) hashes.add(hash(analyticsInitScript(process.env.NEXT_PUBLIC_GA_ID)));
    manifest[path] = [...hashes];
  }
}
await writeFile(".open-next/csp-hashes.json", JSON.stringify(manifest));
console.log(`Built nonce CSP metadata for ${Object.keys(manifest).length} LowBatteryTown routes.`);
