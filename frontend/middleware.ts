import type { NextRequest } from "next/server";
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

function buildCsp(nonce: string): string {
  const scriptSrc = isProd
    ? `'self' 'nonce-${nonce}' 'strict-dynamic'`
    : `'self' 'nonce-${nonce}' 'unsafe-eval' 'unsafe-inline'`;

  const directives = [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self' ${apiOriginHttp} ${apiOriginWs} ws: wss:`,
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

  const response = intlMiddleware(request);
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
