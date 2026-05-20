/**
 * 516149 pack metadata for the canonical pedestrian sheets. Parallel to
 * `./walkers.ts` (legacy inline char-grid sprites). Consumers that have
 * migrated to PNG render via `<PngAnimatedSprite>` import from here;
 * consumers still on inline pixels (e.g. the dev sprite-gallery, login
 * citizens) keep importing from `./walkers.ts` until they migrate.
 *
 * SOLID:
 * - ISP — this module only carries the PNG metadata. It does NOT re-export
 *   the legacy WalkerDef, so a consumer that imports here cannot
 *   accidentally couple to the char-grid contract.
 * - Liskov — each variant exposes the SAME action keys; callers can swap
 *   variant indices freely without changing call shape.
 *
 * Frame dims + counts mirror `public/assets/v6/MANIFEST.json`. If you
 * regenerate the manifest with a different size, sync that change here
 * (or — better — read MANIFEST.json at runtime in a future refactor when
 * we have more PNG-driven sprites than just walkers).
 */

export type PngSheetSpec = {
  readonly url: string;
  readonly frameW: number;
  readonly frameH: number;
  readonly frames: number;
  readonly fps: number;
};

export type PngWalkerVariant = {
  readonly id: 1 | 2 | 3;
  readonly walk: PngSheetSpec;
  readonly idle: PngSheetSpec;
  readonly run: PngSheetSpec;
};

const FRAME = 128; // City_men sheets ship as 128×128 cells

function variant(id: 1 | 2 | 3): PngWalkerVariant {
  const base = `/assets/v6/walkers/City_men_${id}`;
  return {
    id,
    walk: {
      url: `${base}_Walk.png`,
      frameW: FRAME,
      frameH: FRAME,
      frames: 10,
      fps: 10,
    },
    idle: {
      url: `${base}_Idle.png`,
      frameW: FRAME,
      frameH: FRAME,
      frames: 6,
      fps: 8,
    },
    run: {
      url: `${base}_Run.png`,
      frameW: FRAME,
      frameH: FRAME,
      frames: 10,
      fps: 10,
    },
  };
}

export const PNG_WALKERS: readonly PngWalkerVariant[] = [
  variant(1),
  variant(2),
  variant(3),
];

/** Render scale recommended by canonical-reference-index.md § 1.1 layers 70:
 *  128×128 source × 0.45 = 58 px on-screen height. Components may override. */
export const WALKER_SCALE_DEFAULT = 0.45;
