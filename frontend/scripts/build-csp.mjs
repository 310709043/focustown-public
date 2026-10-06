import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { analyticsInitScript } from "../lib/config/analyticsScript.mjs";

// The edge adds a fresh nonce after OpenNext has rendered each response.
// Only afterInteractive analytics needs a stable build-time hash.
// Use the actual built routes so new guide articles receive the same nonce
// protection as the home and policies, without maintaining a second slug list.
const { routes } = JSON.parse(await readFile(".next/prerender-manifest.json", "utf8"));
const publicRoute = /^\/(zh-TW|en)(\/(demo|guide(\/[^/]+)?|policies\/(privacy|terms|guidelines)))?$/;
const manifest = {};
const hash = text => `'sha256-${createHash("sha256").update(text).digest("base64")}'`;
for (const path of Object.keys(routes).filter((path) => publicRoute.test(path))) {
    const hashes = new Set();
    if (process.env.NEXT_PUBLIC_GA_ID) hashes.add(hash(analyticsInitScript(process.env.NEXT_PUBLIC_GA_ID)));
    manifest[path] = [...hashes];
}
await writeFile(".open-next/csp-hashes.json", JSON.stringify(manifest));
console.log(`Built nonce CSP metadata for ${Object.keys(manifest).length} LowBatteryTown routes.`);
