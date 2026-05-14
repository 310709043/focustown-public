import { NextRequest, NextResponse } from "next/server";

/**
 * Per-request CSP nonce.
 *
 * Why: shipping `script-src 'self' 'unsafe-inline'` in production turns the
 * CSP into theatre — any XSS sink immediately exfiltrates tokens from
 * localStorage. Generating a fresh nonce per response and pairing it with
 * `'strict-dynamic'` lets the Next.js bootstrap run while blocking anything
 * an attacker would inject. In development we keep `'unsafe-eval'` + nonce
 * because HMR's bundle reloads rely on eval.
 *
 * The nonce is exposed to RSC/Pages via the `x-csp-nonce` request header so
 * `app/layout.tsx` can read it from `next/headers` and attach it to inline
 * <script> elements.
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

export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce);

  // Pass the nonce to the rendered tree via a request header so RSC can read it.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-csp-nonce", nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // Match everything except static assets and the Next.js internals; CSP on
  // image bytes is meaningless and slowing every static file with a middleware
  // pass is wasteful.
  matcher: [
    {
      source:
        "/((?!api|_next/static|_next/image|favicon.ico|logo.png|logo.svg).*)",
    },
  ],
};
