/**
 * Town Broadcast playlist — short MP4 clips that loop in the billboard.
 *
 * Hosted on Cloudflare R2 (chosen over S3 + CloudFront because R2 egress
 * is free; for a clip that thousands of users may stream concurrently
 * this is the difference between ~$0 / month and tens of dollars).
 *
 * Tier-2 protection (hotlink + scraper deterrent):
 *   - R2 bucket is **private** (no public r2.dev URL).
 *   - Bytes are fetched via a Cloudflare Worker that verifies a
 *     short-TTL HS256 JWT (see infra/worker-broadcast).
 *   - Frontend calls broadcastApi.getPlayToken via the playUrlCache to
 *     obtain a signed URL just-in-time.
 *
 * This module owns only the playlist slug list. URL composition lives
 * in ``lib/broadcast/playUrlCache.ts`` so we never hardcode the Worker
 * host on the client.
 */

/** Stable clip identifier — same slug used by the backend's
 *  ``KNOWN_CLIP_IDS`` set. Naming convention: ``clip-XX``. */
export type BroadcastClipId =
  | "clip-01"
  | "clip-02"
  | "clip-03"
  | "clip-04"
  | "clip-05"
  | "clip-06"
  | "clip-07"
  | "clip-08"
  | "clip-09";

export const BROADCAST_CLIP_IDS: ReadonlyArray<BroadcastClipId> = [
  "clip-01",
  "clip-02",
  "clip-03",
  "clip-04",
  "clip-05",
  "clip-06",
  "clip-07",
  "clip-08",
  "clip-09",
];

/**
 * The broadcast Worker host the browser is allowed to fetch MP4 bytes
 * from. Read by ``middleware.ts`` so CSP ``media-src`` allows the
 * Worker origin. Empty → component shows the static "coming soon"
 * fallback (no token fetch, no CSP noise).
 */
export function broadcastProxyHost(): string {
  return (process.env.NEXT_PUBLIC_BROADCAST_PROXY_BASE_URL ?? "")
    .trim()
    .replace(/\/+$/, "");
}

export function isBroadcastConfigured(): boolean {
  return broadcastProxyHost().length > 0;
}
