import { readFile, writeFile } from "node:fs/promises";
import { LBT_PUBLIC_ROUTE } from "../lib/security/lbtRoutes.mjs";

// The edge adds a fresh nonce after OpenNext has rendered each response.
// No inline script needs a stable build-time hash today (the analytics
// beacon is an external file and gets the nonce like every other tag).
// Use the actual built routes so new guide articles receive the same nonce
// protection as the home and policies, without maintaining a second slug list.
const { routes } = JSON.parse(await readFile(".next/prerender-manifest.json", "utf8"));
const manifest = {};
for (const path of Object.keys(routes).filter((path) => LBT_PUBLIC_ROUTE.test(path))) {
    manifest[path] = [];
}
await writeFile(".open-next/csp-hashes.json", JSON.stringify(manifest));
console.log(`Built nonce CSP metadata for ${Object.keys(manifest).length} LowBatteryTown routes.`);
