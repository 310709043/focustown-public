/**
 * Content-Security-Policy for the LowBatteryTown pages. They need nothing
 * from the legacy Focus Town allowances (MediaPipe on jsDelivr, Google
 * Storage, YouTube embeds, AdSense, WASM), so none of those are here:
 * the chat API, our own files, and Cloudflare Web Analytics.
 *
 * In production cloudflare-worker.mjs swaps `'unsafe-inline'` in
 * script-src for a per-request nonce stamped on every <script>.
 */
export const CF_ANALYTICS_SCRIPT = "https://static.cloudflareinsights.com";
export const CF_ANALYTICS_CONNECT = "https://cloudflareinsights.com";

export interface LbtCspOptions {
  nonce: string;
  prod: boolean;
  apiHttp: string;
  apiWs: string;
}

export function buildLbtCsp({ nonce, prod, apiHttp, apiWs }: LbtCspOptions): string {
  const scriptSrc = prod
    ? `'self' 'unsafe-inline' ${CF_ANALYTICS_SCRIPT}`
    : `'self' 'nonce-${nonce}' 'unsafe-eval' 'unsafe-inline' ${CF_ANALYTICS_SCRIPT}`;
  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "font-src 'self' data:",
    `connect-src 'self' ${apiHttp} ${apiWs} ${CF_ANALYTICS_CONNECT}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
  ].join("; ");
}
