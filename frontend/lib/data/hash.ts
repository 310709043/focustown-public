/**
 * Deterministic 32-bit hash for user IDs.
 *
 * Same algorithm as previously inlined in `Pedestrians.tsx` and
 * `CarsLane.tsx` — extracted so any module that wants to derive a stable
 * per-user value (entity kind, sprite variant, motion duration) shares
 * one implementation.
 *
 * Output is always non-negative. Stable across SSR and CSR so list
 * renderers don't reshuffle on hydration.
 */
export function hashUserId(userId: string): number {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}
