"use client";

import { broadcastApi } from "@/lib/api/endpoints";

/**
 * Caches signed-URL responses from `POST /broadcast/{clip_id}/play-token`
 * so the billboard doesn't hammer the backend with one HTTP request per
 * clip change in the 10-clip rotation. Cache key = clip id; entry holds
 * URL + expiry. A 30-second cushion forces refresh ahead of the actual
 * deadline so a clip that starts playing 5 seconds before TTL doesn't
 * mid-play 401.
 *
 * Mirrors `frontend/lib/audio/playUrlCache.ts` deliberately — same
 * shape, same refresh strategy, same invalidate semantics. Keeping the
 * two caches structurally parallel makes drift visible in code review.
 */

interface Entry {
  url: string;
  expiresAt: number; // ms
  inflight: Promise<string> | null;
}

const REFRESH_LEAD_MS = 30_000;

const cache = new Map<string, Entry>();

export async function getBroadcastPlayUrl(clipId: string): Promise<string> {
  const entry = cache.get(clipId);
  const now = Date.now();
  if (entry && entry.expiresAt - REFRESH_LEAD_MS > now) {
    return entry.url;
  }
  if (entry?.inflight) return entry.inflight;

  const inflight = broadcastApi
    .getPlayToken(clipId)
    .then((res) => {
      cache.set(clipId, {
        url: res.url,
        expiresAt: Date.parse(res.expires_at),
        inflight: null,
      });
      return res.url;
    })
    .catch((err) => {
      cache.delete(clipId);
      throw err;
    });
  cache.set(clipId, {
    url: entry?.url ?? "",
    expiresAt: entry?.expiresAt ?? 0,
    inflight,
  });
  return inflight;
}

/** Drop the cached URL — call on 401 to force a fresh issuance. */
export function invalidateBroadcast(clipId: string): void {
  cache.delete(clipId);
}

/** Test-only: clear everything. */
export function _clearBroadcastCacheForTests(): void {
  cache.clear();
}
