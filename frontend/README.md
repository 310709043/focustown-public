# Frontend

## Cloudflare deploy

Install with Node.js 22 and pnpm 9 (`pnpm install --frozen-lockfile`). The
Cloudflare target uses OpenNext; the existing `pnpm build` / `pnpm start`
Node.js target remains available.

Set these public **build-time** variables before `pnpm cf:build`:

```sh
export NEXT_PUBLIC_API_BASE_URL=https://api.lowbatterytown.com
export NEXT_PUBLIC_WS_BASE_URL=wss://api.lowbatterytown.com
export NEXT_PUBLIC_SITE_URL=https://www.lowbatterytown.com
pnpm cf:build
pnpm cf:preview
```

Preview `/zh-TW` and `/zh-TW/demo` on Wrangler's local URL. Demo needs no backend;
live chat uses the separate API Worker. Changing `NEXT_PUBLIC_*` requires a
rebuild. CSP is generated in `middleware.ts` and allows the configured HTTPS
and WebSocket origins.

`pnpm cf:deploy` builds and deploys `lbt-web`. For CI, configure repository
secrets `CLOUDFLARE_API_TOKEN` (Workers deployment and zone permissions for the
custom domains) and `CLOUDFLARE_ACCOUNT_ID`. Secrets are never public env vars.
The workflow deploys pushes to `develop` affecting `frontend/` and supports
manual dispatch. Both custom domains must belong to the configured Cloudflare
account, with the zone active in Cloudflare. Existing conflicting DNS/Worker
routes must be resolved before deployment. Apex requests redirect with 301 to
`https://www.lowbatterytown.com`, preserving path and query.
The small `cloudflare-worker.mjs` entry redirects before OpenNext's image
handler; `run_worker_first` also covers static assets. The Next.js redirect
keeps the same canonical domain when using the Node.js target.

Check bundle size without deploying:

```sh
pnpm exec wrangler deploy --dry-run --outdir .open-next/dry-run
```

OpenNext and Wrangler output is ignored. No API Worker, backend, AWS or Lightsail
configuration is managed by this frontend workflow.

## Search visibility

The indexable pages are the bilingual home, `/[locale]/guide` and the three
LowBatteryTown policies. Demo and legacy routes keep `noindex`; private chats
are never published as search content. The guide is server-rendered and linked
from the home footer, with localized canonical, hreflang and sharing metadata.
Update `CONTENT_UPDATED` in `lib/lbt/site.ts` when public content changes.

For Google Search Console, verify the `lowbatterytown.com` domain property,
submit `https://www.lowbatterytown.com/sitemap.xml`, and inspect the Chinese
and English home and guide URLs. Verification needs the owner's Google
account; no verification token or access is bundled with the site. Track
indexed pages, search impressions and clicks before judging SEO changes.
Sitemaps and metadata do not guarantee indexing or a ranking position.

Browser check: `pnpm exec playwright test e2e/lbt-seo.spec.ts`. When checking
a deployed site, set `PLAYWRIGHT_NO_SERVER=1` and `PLAYWRIGHT_BASE_URL` to its
origin; `NEXT_PUBLIC_SITE_URL` must match the value used for that build.
