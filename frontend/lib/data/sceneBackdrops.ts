import type { SceneName } from "../state/sceneStore";

/**
 * v2 SceneBackdrop composition table — one row per app scene.
 *
 * Source compositions live in `scene-preview/proposed-15/index.html` (the
 * 15-scene art-direction baseline approved 2026-05-20). Of those 15, the 9
 * picked below give every app scene a mood-matched 322807 city composite
 * plus 1–2 small 801184 cloud sprites; three night scenes layer a 281031
 * `background 4/1` (moon + dotted stars) overlay via screen-blend.
 *
 * Coverage: all 8 322807 cities, all 8 801184 cloud shapes, 3 palettes
 * (white / gray / black). See `scene-preview/proposed-15/_manifest.json`
 * for the full 15-row source mapping.
 */

export type CloudTier =
  | "top-l"
  | "top-c"
  | "top-r"
  | "mid-l"
  | "mid-c"
  | "mid-r"
  | "low-l"
  | "low-r";

export type CloudSpec = {
  /** Absolute URL under /assets/v6/backdrop/clouds/ */
  src: string;
  tier: CloudTier;
  /** rAF drift speed in px/frame at 60fps. Top tier ≈ 0.06, mid ≈ 0.10, low ≈ 0.16. */
  driftPxPerFrame: number;
  /** Phase offset for the breathing keyframe so sprites don't pulse in sync. */
  breathDelaySec: number;
};

export type SkyOverlay = {
  src: string;
  /** Opacity for the screen-blend layer. 0.4–0.55 in the approved baseline. */
  opacity: number;
};

export type BackdropSpec = {
  /** 322807 city composite — full-stage backdrop. */
  cityPng: string;
  /** Optional 281031 sky overlay (moon + stars) on top of the city. */
  skyOverlay?: SkyOverlay;
  clouds: readonly CloudSpec[];
};

const CITY = (n: number) => `/assets/v6/backdrop/city/city-${n}.png`;
const SKY_NIGHT = `/assets/v6/backdrop/sky/night-bg4.png`;
const CLOUD = (palette: "white" | "gray" | "black", shape: number, size: number) =>
  `/assets/v6/backdrop/clouds/${palette}/shape${shape}-${size}.png`;

// Drift speeds by tier — kept here so a tier-rebalance only touches one place.
const DRIFT = { top: 0.06, mid: 0.1, low: 0.16 } as const;
const driftFor = (tier: CloudTier) =>
  tier.startsWith("top") ? DRIFT.top : tier.startsWith("mid") ? DRIFT.mid : DRIFT.low;

const cloud = (
  palette: "white" | "gray" | "black",
  shape: number,
  size: number,
  tier: CloudTier,
  breathDelaySec: number,
): CloudSpec => ({
  src: CLOUD(palette, shape, size),
  tier,
  driftPxPerFrame: driftFor(tier),
  breathDelaySec,
});

export const SCENE_BACKDROPS: Record<SceneName, BackdropSpec> = {
  midnight: {
    cityPng: CITY(7),
    skyOverlay: { src: SKY_NIGHT, opacity: 0.4 },
    clouds: [
      cloud("white", 5, 3, "mid-c", 0),
      cloud("black", 3, 3, "low-r", 3.5),
    ],
  },
  dawn: {
    cityPng: CITY(4),
    clouds: [
      cloud("white", 1, 2, "top-r", 0),
      cloud("white", 7, 3, "mid-l", 4),
    ],
  },
  day: {
    cityPng: CITY(5),
    clouds: [
      cloud("white", 5, 3, "top-l", 0),
      cloud("white", 8, 3, "mid-r", 3),
    ],
  },
  cloudy: {
    cityPng: CITY(8),
    clouds: [
      cloud("white", 4, 3, "low-l", 0),
      cloud("white", 5, 3, "top-c", 4),
    ],
  },
  rain: {
    cityPng: CITY(3),
    clouds: [
      cloud("white", 2, 3, "top-c", 0),
      cloud("white", 4, 3, "low-l", 3.5),
    ],
  },
  storm: {
    cityPng: CITY(6),
    skyOverlay: { src: SKY_NIGHT, opacity: 0.45 },
    clouds: [cloud("white", 7, 3, "top-r", 0)],
  },
  dusk: {
    cityPng: CITY(2),
    clouds: [
      cloud("gray", 6, 3, "mid-r", 0),
      cloud("white", 1, 3, "top-l", 4),
    ],
  },
  night: {
    cityPng: CITY(1),
    skyOverlay: { src: SKY_NIGHT, opacity: 0.55 },
    clouds: [cloud("white", 5, 3, "mid-c", 0)],
  },
  snow: {
    cityPng: CITY(7),
    clouds: [
      cloud("white", 7, 3, "mid-c", 0),
      cloud("white", 1, 2, "top-r", 3.5),
    ],
  },
};
