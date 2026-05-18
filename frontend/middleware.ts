import { type NextRequest, NextResponse } from "next/server";
import createIntlMiddleware from "next-intl/middleware";

import { routing } from "./i18n/routing";

/**
 * Per-request CSP nonce + locale routing.
 *
 * Why: shipping `script-src 'self' 'unsafe-inline'` in production turns the
 * CSP into theatre — any XSS sink immediately exfiltrates tokens from
 * localStorage. Generating a fresh nonce per response and pairing it with
 * `'strict-dynamic'` lets the Next.js bootstrap run while blocking anything
 * an attacker would inject. In development we keep `'unsafe-eval'` + nonce
 * because HMR's bundle reloads rely on eval.
 *
 * next-intl's middleware handles `/` → `/zh-TW` redirects and writes the
 * `NEXT_LOCALE` cookie. We let it produce the response, then layer CSP on
 * top so locale routing and security headers compose cleanly.
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
  const scriptSrc = isProd
    ? `'self' 'nonce-${nonce}' 'strict-dynamic'`
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
