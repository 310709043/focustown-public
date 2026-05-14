/**
 * Pixel sprite engine — char-grid strings → cached canvas dataURLs.
 *
 * A sprite is a multi-line string. Each character is a pixel; `.` or ` `
 * is transparent, anything else looks up a color in the palette. This is
 * a TypeScript port of the original `reference/pixel.jsx` engine, kept
 * intentionally framework-free so it can be used from React components,
 * the splash gate, or anywhere else that needs a small pixel image.
 *
 * SSR-safe: when `document` is unavailable (server render), the cache
 * returns an empty `data:` URL — the React wrapper redraws on mount
 * client-side, so the `<canvas>` tag is identical SSR/CSR and we avoid
 * a hydration mismatch.
 */

export type Palette = Readonly<Record<string, string>>;

export interface SpriteSize {
  readonly w: number;
  readonly h: number;
}

const EMPTY_DATA_URL = "data:image/gif;base64,R0lGODlhAQABAAAAACw=";

/**
 * Bounded LRU cache. Re-rendering a sprite is cheap on a small canvas
 * but adds up across hundreds of pedestrians/cars, and the dataURL
 * string itself is the heaviest part — caching avoids regenerating it.
 * Insertion order gives us LRU for free: `Map.keys().next()` is the
 * oldest entry.
 */
const CACHE_MAX = 200;
const cache = new Map<string, string>();

function cacheGet(key: string): string | undefined {
  const url = cache.get(key);
  if (url === undefined) return undefined;
  // Refresh recency: delete + re-insert moves to most-recent position.
  cache.delete(key);
  cache.set(key, url);
  return url;
}

function cacheSet(key: string, url: string): void {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, url);
}

function splitSprite(sprite: string): readonly string[] {
  return sprite.replace(/^\n+/, "").replace(/\n+$/, "").split("\n");
}

export function spriteSize(sprite: string): SpriteSize {
  const lines = splitSprite(sprite);
  return {
    w: Math.max(0, ...lines.map((l) => l.length)),
    h: lines.length,
  };
}

export function spriteToCanvas(sprite: string, palette: Palette): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const lines = splitSprite(sprite);
  const h = lines.length;
  const w = Math.max(0, ...lines.map((l) => l.length));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  for (let y = 0; y < h; y++) {
    const row = lines[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === "." || ch === " ") continue;
      const col = palette[ch];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return canvas;
}

export function spriteToDataURL(sprite: string, palette: Palette): string {
  if (typeof document === "undefined") return EMPTY_DATA_URL;
  const key = sprite + "|" + JSON.stringify(palette);
  const hit = cacheGet(key);
  if (hit !== undefined) return hit;
  const canvas = spriteToCanvas(sprite, palette);
  if (!canvas) return EMPTY_DATA_URL;
  const url = canvas.toDataURL();
  cacheSet(key, url);
  return url;
}
