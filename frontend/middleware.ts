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
const broadcastProxyHost = (
  process.env.NEXT_PUBLIC_BROADCAST_PROXY_BASE_URL ?? ""
).trim();
const mediaOrigins = [
  ...(process.env.NEXT_PUBLIC_MEDIA_ALLOWED_ORIGINS ?? apiOriginHttp)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  ...(broadcastProxyHost ? [broadcastProxyHost] : []),
].join(" ");

function buildCsp(nonce: string): string {
  // Prod uses `'self' 'unsafe-inline'` (NOT `'self' 'nonce-...' 'unsafe-inline'`
  // — the nonce source would suppress `'unsafe-inline'` per CSP spec and break
  // every prerendered route). See the file header for the full rationale.
  // Dev keeps the nonce so any dynamic page can opt-in via headers().
  const scriptSrc = isProd
    ? `'self' 'unsafe-inline'`
    : `'self' 'nonce-${nonce}' 'unsafe-eval' 'unsafe-inline'`;

  const directives = [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    `media-src 'self' ${mediaOrigins} blob:`,
    "font-src 'self' data:",
    // Restrict to the known API origin only. Bare `ws:`/`wss:` wildcards
    // would let an injected script open a WebSocket to attacker-controlled
    // hosts and exfiltrate chat/tokens. The legitimate WS target is already
    // included via apiOriginWs (derived from NEXT_PUBLIC_API_BASE_URL).
    `connect-src 'self' ${apiOriginHttp} ${apiOriginWs} https://cdn.jsdelivr.net https://storage.googleapis.com`,
    // MediaPipe WASM needs wasm-unsafe-eval; worker-src blob: for its threads.
    `script-src ${scriptSrc} 'wasm-unsafe-eval'`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "frame-src 'none'",
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
    //   _next/static Next.js bundle chunks
    //   _next/image  Next.js Image Optimizer
    //   audio        public /audio/lofi-*.mp3 fallback (was redirecting to
    //                /en/audio/... and 404ing the static asset)
    //   assets       public /assets/v6/** Craftpix sprite library (city /
    //                clouds / walkers / birds / cars) — same gotcha as
    //                /audio above; without this, the live deploy 307s
    //                /assets/v6/MANIFEST.json into /zh-TW/assets/... → 404
    //                and the new sprites silently fail to render.
    //   favicon.ico  small static file
    //   logo.png     static image
    "/((?!api|_next/static|_next/image|audio|assets|favicon.ico|logo.png).*)",
  ],
};
