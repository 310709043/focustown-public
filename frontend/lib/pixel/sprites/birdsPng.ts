/**
 * 291971 farm-animals top-down sheets — Chick + Rooster (only). Canonical
 * NamedBirds bundle per docs/qa/canonical-reference-index.md § 1.1 layer 72.
 *
 * Each sheet is a 6×8 grid: 6 frames × 8 directional rows (N, NE, E, SE,
 * S, SW, W, NW per Craftpix top-down convention). For the side-view
 * LowBatteryTown scene we render the South-facing row by default (row=4),
 * which puts the sprite belly-forward toward the camera.
 *
 * Cell sizes differ per animal — Chick is 16×16, Rooster is 32×32.
 */

import type { PngSheetSpec } from "./walkersPng";

export type PngBirdSpec = PngSheetSpec & {
  /** Row index in the multi-row top-down grid. 0=N, 4=S. */
  readonly row: number;
  /** Frame count per direction (6 across all 8 rows). */
  readonly frames: 6;
};

export const PNG_BIRDS: Readonly<{ chick: PngBirdSpec; rooster: PngBirdSpec }> =
  {
    chick: {
      url: "/assets/v6/birds/Chick.png",
      frameW: 16,
      frameH: 16,
      frames: 6,
      fps: 8,
      row: 4,
    },
    rooster: {
      url: "/assets/v6/birds/Rooster.png",
      frameW: 32,
      frameH: 32,
      frames: 6,
      fps: 8,
      row: 4,
    },
  };
