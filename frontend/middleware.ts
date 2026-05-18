import { type NextRequest, NextResponse } from "next/server";
import createIntlMiddleware from "next-intl/middleware";

import { routing } from "./i18n/routing";

/**
 * Per-request CSP nonce + locale routing.
 *
 * Why no `'strict-dynamic'`: our app uses Next.js's default static prerender
 * (`X-Nextjs-Prerender: 1` on /en and /zh-TW). The framework chunk <script>
 * tags are baked into the HTML at `next build` time, before middleware runs,
 * so they cannot carry a per-request nonce. Pairing strict-dynamic with a
 * nonce against prerendered HTML blocks every chunk → no hydration → the
 * SplashGate loading overlay stays forever.
 *
 * Trade-off: `'self'` allows any same-origin script to execute, including a
 * hypothetical injected `<script src="/some/path.js">` if an attacker can
 * write into a same-origin path. We still block inline scripts (no
 * `'unsafe-inline'`) and dynamic-eval (no `'unsafe-eval'`), which closes the
 * common XSS sinks. The nonce stays in script-src so any future
 * non-prerendered pages (or `<Script nonce={headers().get('x-nonce')}>`)
 * can still benefit.
 *
 * next-intl's middleware handles `/` → `/zh-TW` redirects and writes the
 * `NEXT_LOCALE` cookie. We compose with it carefully below — its internal
 * NextResponse.next/rewrite calls don't forward request headers, so we
 * rebuild the outbound response to carry x-nonce through.
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
// keeps working out of the box.
const mediaOrigins = (process.env.NEXT_PUBLIC_MEDIA_ALLOWED_ORIGINS ?? apiOriginHttp)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)
  .join(" ");

function buildCsp(nonce: string): string {
  // Prod: nonce kept for future dynamic pages; 'self' is what actually
  // unblocks /_next/static/chunks/* on prerendered routes. Inline scripts
  // and eval are NOT allowed.
  // Dev: HMR needs eval + inline; keep them gated behind NODE_ENV.
  const scriptSrc = isProd
    ? `'self' 'nonce-${nonce}'`
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
    `connect-src 'self' ${apiOriginHttp} ${apiOriginWs}`,
    // App spawns no Web Workers and no PWA manifest; lock those vectors.
    "worker-src 'self'",
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

export function middleware(request: NextRequest) {
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
  return response;
}

export const config = {
  // Match everything except static assets and the Next.js internals. CSP on
  // image bytes is meaningless and slowing every static file with a middleware
  // pass is wasteful.
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|logo.png|logo.svg).*)",
  ],
};
