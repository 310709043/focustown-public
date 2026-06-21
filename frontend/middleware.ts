import { type NextRequest, NextResponse } from "next/server";
import createIntlMiddleware from "next-intl/middleware";

import { routing } from "./i18n/routing";

/**
 * CSP + locale routing.
 *
 * Architectural pin: Next.js statically prerenders /en and /zh-TW (verified
 * via `X-Nextjs-Prerender: 1`). Static prerender bakes the HTML at
 * `next build` time, including the RSC-bootstrap inline <script> blobs that
 * Next.js injects (`__next_f.push(...)`, route manifest, etc.). Those inline
 * scripts cannot carry a per-request nonce — no middleware runs at build
 * time. Browsers (per CSP spec) IGNORE `'unsafe-inline'` whenever a nonce
 * source is present in script-src; so a script-src directive with both
 * `'nonce-X'` and `'unsafe-inline'` blocks the framework inline scripts
 * → no hydration → SplashGate overlay frozen.
 *
 * Resolution: drop the nonce from production script-src and rely on
 *   `'self' 'unsafe-inline'`
 * which lets the framework's inline payloads run. The remaining defences:
 *   - no `'unsafe-eval'`     → blocks dynamic-eval gadgets
 *   - no external sources    → blocks third-party script injection
 *   - no `data:` URI scripts → blocks data-URL script smuggling
 *   - origin-pinned `connect-src` (no `ws:/wss:` wildcards)
 *   - `worker-src` / `manifest-src` / `frame-src 'none'` for unused channels
 *   - HSTS, X-Frame, X-Content, Referrer-Policy, Permissions-Policy
 *
 * The realistic XSS surface this concedes: an attacker who lands a sink can
 * execute inline JS. Next.js + React escape user content by default, so the
 * remaining sinks are bugs (`dangerouslySetInnerHTML`, third-party
 * libraries) — audited as zero in this codebase. The right next step is
 * not stricter CSP but a `report-to` violation collector + dependency CVE
 * scanning, both tracked separately.
 *
 * Dev keeps `'unsafe-eval'` + `'unsafe-inline'` for HMR.
 *
 * next-intl's middleware handles `/` → `/zh-TW` redirects and writes the
 * `NEXT_LOCALE` cookie. We still set `x-nonce` on the request and rebuild
 * the outbound response through `NextResponse.next/rewrite({request})` so
 * any future dynamic page that opts in with `headers().get('x-nonce')`
 * can read it.
 */

const isProd = process.env.NODE_ENV === "production";

const apiOriginHttp = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
const apiOriginWs = apiOriginHttp.replace(/^http/, "ws");

// Origins the browser is allowed to load <audio>/<video> bytes from. The
// streaming endpoint lives on the backend (cross-origin from the frontend
// in dev) and, in S3 mode, the backend 302-redirects to MinIO / CloudFront —
// each of those final hosts also has to be allow-listed here, because CSP
// re-checks media-src against the post-redirect URL.
//
// Comma-separated NEXT_PUBLIC_MEDIA_ALLOWED_ORIGINS lets ops add hosts
// without code changes; when unset, fall back to the API origin so dev
// keeps working out of the box. The Town Broadcast slot streams MP4
// clips from a Cloudflare Worker fronting a *private* R2 bucket; allow
// that Worker origin (NEXT_PUBLIC_BROADCAST_PROXY_BASE_URL) too when
// configured so the <video> in Billboard.tsx is not blocked by CSP.
// Filter helper: accept only http(s) origins so a 'disabled' placeholder
// baked in by deploy-dev.sh is silently dropped rather than appearing in
// the CSP header as an invalid source expression.
const _isHttpOrigin = (s: string) =>
  s.startsWith("http://") || s.startsWith("https://");

const broadcastProxyHost = (
  process.env.NEXT_PUBLIC_BROADCAST_PROXY_BASE_URL ?? ""
).trim();
const mediaOrigins = [
  ...(process.env.NEXT_PUBLIC_MEDIA_ALLOWED_ORIGINS ?? apiOriginHttp)
    .split(",")
    .map((s) => s.trim())
    .filter(_isHttpOrigin),
  ...(broadcastProxyHost && _isHttpOrigin(broadcastProxyHost)
    ? [broadcastProxyHost]
    : []),
].join(" ") || apiOriginHttp;

// GA4 CSP origins — always allowed so the CSP doesn't depend on
// build-time env resolution (which can be stale across Docker cache layers).
// When GA4 isn't loaded, no script talks to these origins — safe no-op.
const gaScriptSrc = " https://www.googletagmanager.com https://www.google-analytics.com";
const gaConnectSrc = " https://www.google-analytics.com https://analytics.google.com https://stats.g.doubleclick.net";
const gaImgSrc = " https://www.google-analytics.com https://www.googletagmanager.com";

// AdSense CSP origins — only appended when the publisher ID is configured.
const adsenseEnabled = (process.env.NEXT_PUBLIC_ADSENSE_PUB_ID ?? "").length > 0;
const adScriptSrc = adsenseEnabled
  ? " https://pagead2.googlesyndication.com https://www.googletagservices.com https://adservice.google.com https://adservice.google.com.tw"
  : "";
const adImgSrc = adsenseEnabled
  ? " https://pagead2.googlesyndication.com https://www.google.com https://www.google.com.tw"
  : "";
const adFrameSrc = adsenseEnabled
  ? " https://googleads.g.doubleclick.net https://tpc.googlesyndication.com https://www.google.com"
  : "";
const adConnectSrc = adsenseEnabled
  ? " https://pagead2.googlesyndication.com https://adservice.google.com"
  : "";

function buildCsp(nonce: string): string {
  // Prod uses `'self' 'unsafe-inline'` (NOT `'self' 'nonce-...' 'unsafe-inline'`
  // — the nonce source would suppress `'unsafe-inline'` per CSP spec and break
  // every prerendered route). See the file header for the full rationale.
  // Dev keeps the nonce so any dynamic page can opt-in via headers().
  // cdn.jsdelivr.net is needed for MediaPipe's FilesetResolver which injects
  // <script> tags pointing to the WASM loader at that CDN origin.
  const scriptSrc = isProd
    ? `'self' 'unsafe-inline' https://cdn.jsdelivr.net${adScriptSrc}${gaScriptSrc}`
    : `'self' 'nonce-${nonce}' 'unsafe-eval' 'unsafe-inline' https://cdn.jsdelivr.net${adScriptSrc}${gaScriptSrc}`;

  const directives = [
    "default-src 'self'",
    // MediaPipe WASM needs wasm-unsafe-eval. CSP ignores duplicate directives
    // (only the first wins), so this must be the single script-src entry.
    `script-src ${scriptSrc} 'wasm-unsafe-eval'`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob:${adImgSrc}${gaImgSrc}`,
    `media-src 'self' ${mediaOrigins} blob:`,
    "font-src 'self' data:",
    // Restrict to the known API origin only. Bare `ws:`/`wss:` wildcards
    // would let an injected script open a WebSocket to attacker-controlled
    // hosts and exfiltrate chat/tokens. The legitimate WS target is already
    // included via apiOriginWs (derived from NEXT_PUBLIC_API_BASE_URL).
    `connect-src 'self' ${apiOriginHttp} ${apiOriginWs} https://cdn.jsdelivr.net https://storage.googleapis.com${adConnectSrc}${gaConnectSrc}`,
    // MediaPipe worker threads need blob: URLs.
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    `frame-src https://www.youtube-nocookie.com${adFrameSrc}`,
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
  ];
  return directives.join("; ");
}

const intlMiddleware = createIntlMiddleware(routing);

// Legacy alias: external links / typos use `/zh/...` thinking it's the
// Chinese locale, but the canonical locale is `zh-TW`. next-intl's
// middleware treats unknown prefixes as no-locale and prepends the
// detected locale, producing `/zh-TW/zh/foo` which 404s. Catch the
// alias first and issue a permanent redirect to the canonical path.
// /zh → /zh-TW, /zh/ → /zh-TW, /zh/foo/bar → /zh-TW/foo/bar.
function redirectLegacyZhAlias(request: NextRequest): NextResponse | null {
  const path = request.nextUrl.pathname;
  if (path !== "/zh" && !path.startsWith("/zh/")) return null;
  const rest = path === "/zh" ? "" : path.slice(3); // strip "/zh"
  const url = request.nextUrl.clone();
  url.pathname = `/zh-TW${rest}`;
  return NextResponse.redirect(url, 308);
}

export function middleware(request: NextRequest) {
  const legacy = redirectLegacyZhAlias(request);
  if (legacy) return legacy;

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce);

  // Next.js stamps `nonce=` on its SSR-injected <script> tags ONLY when the
  // inner request carries `x-nonce` — and "carries" means the framework's
  // own request object, not whatever middleware mutated. The only way to make
  // it visible there is `NextResponse.next/rewrite({ request: { headers } })`.
  // Mutating `request.headers` directly is a no-op for the SSR pass.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  // next-intl's middleware decides: redirect (3xx for /  → /zh-TW),
  // rewrite (200 + x-middleware-rewrite for /zh-TW/foo → /[locale]/foo),
  // or passthrough (200 + no rewrite). It internally calls
  // NextResponse.next/rewrite WITHOUT { request: { headers } }, so we cannot
  // let its response stand — we have to rebuild the non-redirect cases with
  // our header-carrying request, then port intl's cookies (NEXT_LOCALE) over.
  const intlResponse = intlMiddleware(request);

  let response: NextResponse;
  const isRedirect = intlResponse.status >= 300 && intlResponse.status < 400;
  if (isRedirect) {
    response = intlResponse;
  } else {
    const rewriteUrl = intlResponse.headers.get("x-middleware-rewrite");
    if (rewriteUrl) {
      response = NextResponse.rewrite(new URL(rewriteUrl), {
        request: { headers: requestHeaders },
      });
    } else {
      response = NextResponse.next({ request: { headers: requestHeaders } });
    }
    for (const cookie of intlResponse.cookies.getAll()) {
      response.cookies.set(cookie);
    }
    const vary = intlResponse.headers.get("vary");
    if (vary) response.headers.set("Vary", vary);
  }

  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("x-csp-nonce", nonce);
  response.headers.set(
    "Permissions-Policy",
    "camera=(self), microphone=(), geolocation=(), interest-cohort=()",
  );
  return response;
}

export const config = {
  // Match everything except static assets and the Next.js internals. CSP on
  // image bytes is meaningless and slowing every static file with a middleware
  // pass is wasteful.
  matcher: [
    // Negative lookahead excludes paths that should bypass next-intl's
    // locale prefix:
    //   api          REST endpoints
    //   _next        Next.js bundles + Image Optimizer
    //   .*\..*       ANY path with a file extension (a dot in the last
    //                segment). This is the durable fix for a bug that
    //                recurred four times: every new public static file
    //                (audio/lofi-*.mp3, assets/v6/*.json, logo.png,
    //                logo-trimmed.png, og-image.png, robots.txt,
    //                sitemap.xml, manifest.webmanifest, ads.txt) had to
    //                be hand-added to a per-file allowlist, and whoever
    //                shipped a new asset without remembering got a silent
    //                307 → /zh-TW/<file> → 404. App routes never contain
    //                a dot (UUID ids, slug segments), so excluding all
    //                dotted paths bypasses i18n for every static asset at
    //                once with no false positives.
    "/((?!api|_next|.*\\..*).*)",
  ],
};
