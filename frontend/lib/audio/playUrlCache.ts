"use client";

import { tracksApi } from "@/lib/api/endpoints";

/**
 * Caches the signed-URL responses from `POST /tracks/{id}/play-token`
 * so a single browser session doesn't burn one HTTP request per
 * track-tick. The cache key is the track id; the cached entry holds a
 * URL + its expiry, and a 30-second cushion forces a refresh ahead of
 * the actual deadline so a long song never mid-play expires.
 *
 * Local fallback tracks (`local:*`) never enter this cache — they map
 * directly to static `/audio/*.mp3` assets in the frontend image.
 */

interface Entry {
  url: string;
  expiresAt: number; // ms
  inflight: Promise<string> | null;
}

const REFRESH_LEAD_MS = 30_000;

const cache = new Map<string, Entry>();

const LOCAL_AUDIO: Record<string, string> = {
  "local:lofi-1": "/audio/lofi-1.mp3",
  "local:lofi-2": "/audio/lofi-2.mp3",
  "local:lofi-3": "/audio/lofi-3.mp3",
};

export function isLocalTrackId(trackId: string): boolean {
  return trackId.startsWith("local:");
}

export function localUrl(trackId: string): string {
  return LOCAL_AUDIO[trackId] ?? "";
}

export async function getPlayUrl(trackId: string): Promise<string> {
  if (isLocalTrackId(trackId)) return localUrl(trackId);

  const entry = cache.get(trackId);
  const now = Date.now();
  if (entry && entry.expiresAt - REFRESH_LEAD_MS > now) {
    return entry.url;
  }
  if (entry?.inflight) return entry.inflight;

  const inflight = tracksApi
    .getPlayToken(trackId)
    .then((res) => {
      cache.set(trackId, {
        url: res.url,
        expiresAt: Date.parse(res.expires_at),
        inflight: null,
      });
      return res.url;
    })
    .catch((err) => {
      cache.delete(trackId);
      throw err;
    });
  cache.set(trackId, {
    url: entry?.url ?? "",
    expiresAt: entry?.expiresAt ?? 0,
    inflight,
  });
  return inflight;
}

/** Drop the cached URL — call on 401 to force a fresh issuance. */
export function invalidate(trackId: string): void {
  cache.delete(trackId);
}

/** Test-only: clear everything. */
export function _clearForTests(): void {
  cache.clear();
}
