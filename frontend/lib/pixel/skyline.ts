/**
 * Procedural pixel skyline — draws a deterministic city silhouette to a
 * canvas. Ported from `reference/sprites.jsx#drawSkyline`. The seed
 * controls building widths/heights/window patterns so the same `seed`
 * value redraws identically; combining three different seeds + sizes
 * produces the parallax-layered skyline used on the login scene.
 *
 * Call from inside an effect with the canvas ref + size known. The
 * function mutates the canvas in place and returns the building array
 * so callers can overlay tags (e.g. building names) above each.
 */

export interface SkylinePalette {
  readonly body: string;
  readonly edge: string;
  readonly windows: readonly string[];
}

export interface SkylineOptions {
  readonly width: number;
  readonly height: number;
  readonly palette: SkylinePalette;
  readonly seed?: number;
  /** "bg" suppresses tall foreground buildings — used for far layers. */
  readonly layer?: "fg" | "bg";
}

export interface SkylineBuilding {
  readonly x: number;
  readonly w: number;
  readonly h: number;
  readonly kind: number;
}

export const SKYLINE_PALETTES = {
  neon: {
    body: "#0b0524",
    edge: "#241355",
    windows: ["#fcd34d", "#67e8f9", "#f0abfc", "#6ee7b7"],
  },
  dusk: {
    body: "#1a0f1f",
    edge: "#3a1a2e",
    windows: ["#ffd166", "#ff8c5a", "#ff6b9d", "#ffb86b"],
  },
  rain: {
    body: "#050d2a",
    edge: "#1a2a5a",
    windows: ["#00f5d4", "#ff006e", "#ffbe0b", "#8338ec"],
  },
} as const satisfies Record<string, SkylinePalette>;

/** Shade a hex color by multiplying each channel by `k` (0–1). */
export function shadeHex(hex: string, k: number): string {
  const c = hex.replace("#", "");
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  const hex2 = (x: number) => Math.floor(x * k).toString(16).padStart(2, "0");
  return `#${hex2(r)}${hex2(g)}${hex2(b)}`;
}

export function drawSkyline(
  canvas: HTMLCanvasElement,
  opts: SkylineOptions,
): SkylineBuilding[] {
  const { width, height, palette, seed = 1, layer = "fg" } = opts;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return [];
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, width, height);

  // Seeded RNG so the same seed yields the same skyline.
  let s = seed;
  const rng = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };

  const minH = layer === "fg" ? Math.floor(height * 0.55) : Math.floor(height * 0.35);
  const maxH = layer === "fg" ? Math.floor(height * 0.95) : Math.floor(height * 0.75);

  let x = 0;
  const buildings: SkylineBuilding[] = [];
  while (x < width + 20) {
    const w = 18 + Math.floor(rng() * 36);
    const h = minH + Math.floor(rng() * (maxH - minH));
    buildings.push({ x, w, h, kind: Math.floor(rng() * 4) });
    x += w + Math.floor(rng() * 4);
  }

  for (const b of buildings) {
    const yTop = height - b.h;
    ctx.fillStyle = palette.body;
    ctx.fillRect(b.x, yTop, b.w, b.h);

    // Roof embellishments — antenna / box / tower.
    if (b.kind === 0) {
      ctx.fillRect(b.x + b.w / 2 - 1, yTop - 4, 2, 4);
    } else if (b.kind === 1) {
      ctx.fillRect(b.x + 2, yTop - 3, b.w - 4, 3);
    } else if (b.kind === 2) {
      ctx.fillRect(b.x + b.w / 2 - 3, yTop - 6, 6, 6);
      ctx.fillRect(b.x + b.w / 2 - 1, yTop - 10, 2, 4);
    }

    // Edge highlights.
    ctx.fillStyle = palette.edge;
    ctx.fillRect(b.x, yTop, 1, b.h);
    ctx.fillRect(b.x + b.w - 1, yTop, 1, b.h);
    ctx.fillRect(b.x, yTop, b.w, 1);

    // Window grid — random subset lit with palette colors.
    const ww = 2;
    const wh = 3;
    const gap = 2;
    const cols = Math.floor((b.w - 4) / (ww + gap));
    const rows = Math.floor((b.h - 6) / (wh + gap));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (rng() < 0.55) {
          const col = palette.windows[Math.floor(rng() * palette.windows.length)];
          ctx.fillStyle = col;
          const wx = b.x + 2 + c * (ww + gap);
          const wy = yTop + 3 + r * (wh + gap);
          ctx.fillRect(wx, wy, ww, wh);
        }
      }
    }
  }

  return buildings;
}
