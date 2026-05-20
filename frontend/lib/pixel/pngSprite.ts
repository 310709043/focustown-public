/**
 * PNG sprite engine — PNG sheet URLs + frame index → cached canvas dataURLs.
 *
 * Parallel to the char-grid `sprite.ts` engine. Used for assets that ship as
 * real PNG sheets (Craftpix city / clouds / walkers / birds / cars under
 * `public/assets/v6/`) rather than inline char-grids.
 *
 * SSR-safe: when `document` / `Image` are unavailable (server render), the
 * cache returns an empty `data:` URL — React wrappers must redraw on mount
 * client-side, mirroring `sprite.ts`'s pattern to avoid hydration mismatch.
 *
 * Async by nature: PNG loading is non-blocking. Components consume via a
 * `useEffect` hook that calls `pngFrameDataUrl` and `setState`s the result.
 *
 * Two coordinate modes:
 * - linear (single horizontal row) — pass `frameIdx`
 * - grid (multi-row sheets, e.g. top-down animals) — pass `(col, row)`
 */

export const EMPTY_DATA_URL =
  "data:image/gif;base64,R0lGODlhAQABAAAAACw=";

const CACHE_MAX = 200;
const frameCache = new Map<string, string>();
const sheetCache = new Map<string, Promise<HTMLImageElement>>();

function cacheGet(key: string): string | undefined {
  const url = frameCache.get(key);
  if (url === undefined) return undefined;
  frameCache.delete(key);
  frameCache.set(key, url);
  return url;
}

function cacheSet(key: string, url: string): void {
  if (frameCache.size >= CACHE_MAX) {
    const oldest = frameCache.keys().next().value;
    if (oldest !== undefined) frameCache.delete(oldest);
  }
  frameCache.set(key, url);
}

function frameKey(
  url: string,
  col: number,
  row: number,
  w: number,
  h: number,
): string {
  return `${url}#${col},${row}@${w}x${h}`;
}

/**
 * Load a PNG sheet once and cache the promise. Subsequent calls for the same
 * URL return the same Promise. SSR returns a never-resolving promise; the
 * caller is expected to bail to EMPTY_DATA_URL pre-mount.
 */
export function loadSheet(url: string): Promise<HTMLImageElement> {
  const cached = sheetCache.get(url);
  if (cached) return cached;
  if (typeof document === "undefined" || typeof Image === "undefined") {
    const pending = new Promise<HTMLImageElement>(() => {
      /* never resolves on server */
    });
    sheetCache.set(url, pending);
    return pending;
  }
  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      sheetCache.delete(url);
      reject(new Error(`pngSprite: failed to load ${url}`));
    };
    img.src = url;
  });
  sheetCache.set(url, promise);
  return promise;
}

/**
 * Slice a single frame out of a PNG sheet at grid `(col, row)` with cell
 * dimensions `frameW × frameH`, returning a dataURL. Cached per
 * `(url, col, row, frameW, frameH)` tuple.
 *
 * Throws on invalid coordinates or load failure. On SSR returns EMPTY_DATA_URL.
 */
export async function pngFrameDataUrl(
  url: string,
  col: number,
  row: number,
  frameW: number,
  frameH: number,
): Promise<string> {
  if (typeof document === "undefined") return EMPTY_DATA_URL;
  if (frameW <= 0 || frameH <= 0) {
    throw new Error(`pngSprite: frame size must be positive (got ${frameW}×${frameH})`);
  }
  if (col < 0 || row < 0) {
    throw new Error(`pngSprite: frame coords must be ≥ 0 (got col=${col}, row=${row})`);
  }
  const key = frameKey(url, col, row, frameW, frameH);
  const hit = cacheGet(key);
  if (hit !== undefined) return hit;

  const img = await loadSheet(url);
  if (col * frameW >= img.naturalWidth || row * frameH >= img.naturalHeight) {
    throw new Error(
      `pngSprite: frame (${col},${row}) out of bounds — sheet is ${img.naturalWidth}×${img.naturalHeight}`,
    );
  }
  const canvas = document.createElement("canvas");
  canvas.width = frameW;
  canvas.height = frameH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return EMPTY_DATA_URL;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    img,
    col * frameW,
    row * frameH,
    frameW,
    frameH,
    0,
    0,
    frameW,
    frameH,
  );
  const dataUrl = canvas.toDataURL();
  cacheSet(key, dataUrl);
  return dataUrl;
}

/**
 * Convenience for single-row sheets — same as `pngFrameDataUrl(url, frameIdx, 0, w, h)`.
 */
export function pngLinearFrameDataUrl(
  url: string,
  frameIdx: number,
  frameW: number,
  frameH: number,
): Promise<string> {
  return pngFrameDataUrl(url, frameIdx, 0, frameW, frameH);
}

/** Test-only: reset both caches. Exported for unit tests, not for app code. */
export function _resetCachesForTests(): void {
  frameCache.clear();
  sheetCache.clear();
}

/** Test-only: inspect cache size. */
export function _cacheSizeForTests(): { frames: number; sheets: number } {
  return { frames: frameCache.size, sheets: sheetCache.size };
}
