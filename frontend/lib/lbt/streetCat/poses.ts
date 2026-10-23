/**
 * The cat's poses. A pose is plain numbers (joint positions in the cat's own
 * units, facing right, ground at y = 0, up is negative) so any two can be
 * blended. Walking uses a lateral four-beat gait (left hind, left fore,
 * right hind, right fore) with the planted paw moving back exactly as fast
 * as the body moves forward, so feet never slide.
 */
import { TAU, clamp, frac, lerp, rad, smooth, type Vec } from "./geometry";

export type Leg = "lf" | "rf" | "lh" | "rh";
export type Gait = "walk" | "trot";

export interface Pose {
  /** shoulder and hip joints */
  S: Vec;
  H: Vec;
  /** extra rise of the mid back; belly sag */
  arch: number;
  belly: number;
  /** head centre relative to the shoulder; pitch; 0 profile … 1 facing the viewer */
  head: Vec;
  hAng: number;
  turn: number;
  /** eye openness 0–1; pupils widen with excitement */
  eye: number;
  excite: number;
  earN: number;
  earF: number;
  mouth: number;
  tongue: number;
  feet: Record<Leg, Vec>;
  /** fore wrists: 0 standing (paw forward), 1 folded back in a step */
  bend: { lf: number; rf: number };
  /** hind thighs, angle from the forward axis */
  thigh: { lh: number; rh: number };
  tail: { base: number; curl: number; sway: number; freq: number; flick: number };
  rootX: number;
  rootY: number;
  /** how much the near thigh shows as a round haunch (sitting) */
  haunch: number;
  breathe: number;
  /** legs tucked under the body (loafing) */
  tuck: number;
}

export const BONE = { foreA: 15, foreB: 10, thigh: 11, shin: 12, meta: 10 } as const;
export const TAIL_N = 12;
export const TAIL_SEG = 2.7;

interface GaitSpec {
  stride: number;
  duty: number;
  period: number;
  lift: number;
  bob: number;
  off: Record<Leg, number>;
}

export const GAITS: Record<Gait, GaitSpec> = {
  walk: { stride: 20, duty: 0.62, period: 1.05, lift: 4.4, bob: 0.9, off: { lh: 0, lf: 0.25, rh: 0.5, rf: 0.75 } },
  trot: { stride: 30, duty: 0.4, period: 0.52, lift: 7, bob: 1.7, off: { lh: 0, rf: 0.02, rh: 0.5, lf: 0.52 } },
};

/** Speed of a gait in cat units per second. */
export const gaitSpeed = (g: Gait) => GAITS[g].stride / (GAITS[g].duty * GAITS[g].period);

export function basePose(): Pose {
  return {
    S: [19, -27],
    H: [-19, -27],
    arch: 0,
    belly: 0,
    head: [19, -13.5],
    hAng: rad(2),
    turn: 0,
    eye: 1,
    excite: 0,
    earN: 0,
    earF: 0,
    mouth: 0,
    tongue: 0,
    feet: { lf: [21, 0], rf: [22.5, 0], lh: [-16, 0], rh: [-14.5, 0] },
    bend: { lf: 0, rf: 0 },
    thigh: { lh: rad(66), rh: rad(66) },
    tail: { base: rad(-118), curl: rad(5.5), sway: rad(4), freq: 0.6, flick: 0 },
    rootX: 0,
    rootY: 0,
    haunch: 0,
    breathe: 1,
    tuck: 0,
  };
}

type Tree = number | readonly Tree[] | { readonly [key: string]: Tree };

function lerpTree(a: Tree, b: Tree, t: number): Tree {
  if (typeof a === "number") return lerp(a, b as number, t);
  if (Array.isArray(a)) return a.map((v: Tree, i: number) => lerpTree(v, (b as readonly Tree[])[i] as Tree, t));
  const out: Record<string, Tree> = {};
  const bo = b as { readonly [key: string]: Tree };
  for (const key of Object.keys(a)) out[key] = lerpTree((a as { readonly [key: string]: Tree })[key] as Tree, bo[key] as Tree, t);
  return out;
}

/** A new pose between `a` (t = 0) and `b` (t = 1). */
export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  return lerpTree(a as unknown as Tree, b as unknown as Tree, t) as unknown as Pose;
}

/** Where each paw is at a point in the stride; planted paws move back at body speed. */
export function gaitPose(phase: number, kind: Gait): Pose {
  const g = GAITS[kind];
  const p = basePose();
  for (const leg of ["lf", "rf", "lh", "rh"] as const) {
    const q = frac(phase + g.off[leg]);
    const fore = leg[1] === "f";
    let x: number;
    let y = 0;
    let fold = 0;
    if (q < g.duty) {
      x = g.stride / 2 - g.stride * (q / g.duty);
    } else {
      const t = (q - g.duty) / (1 - g.duty);
      x = -g.stride / 2 + g.stride * smooth(t);
      y = -g.lift * (fore ? 0.85 : 1) * Math.sin(Math.PI * t);
      fold = Math.sin(Math.PI * Math.min(1, t * 1.15));
    }
    p.feet[leg] = [(fore ? 21 : -15) + x, y];
    if (leg === "lf" || leg === "rf") p.bend[leg] = fold;
    else p.thigh[leg] = rad(66) - rad(21) * (x / (g.stride / 2)) - rad(10) * Math.sin(Math.PI * clamp(-y / g.lift, 0, 1));
  }
  const w = TAU * 2 * phase;
  p.S = [19, -27 + 0.8 * g.bob * Math.sin(w + 1.1)];
  p.H = [-19, -27.4 + 0.8 * g.bob * Math.sin(w + 0.1)];
  if (kind === "trot") {
    p.S = [20, p.S[1] - 0.8];
    p.head = [21.5, -12 + 0.4 * Math.sin(w + 1.7)];
    p.hAng = rad(-2);
    p.tail = { base: rad(-98), curl: rad(2.2), sway: rad(3), freq: 1.9, flick: 0 };
    p.excite = 0.5;
  } else {
    p.head = [20, -12.5 + 0.55 * g.bob * Math.sin(w + 1.7)];
    p.hAng = rad(5);
    p.tail = { base: rad(-108), curl: rad(6.2), sway: rad(5.5), freq: 0.95, flick: 0 };
  }
  return p;
}

export function sitPose(): Pose {
  return {
    ...basePose(),
    S: [9, -28.5],
    H: [-11, -9.5],
    arch: 2.4,
    head: [13.5, -19.5],
    hAng: rad(-4),
    feet: { lf: [13.5, 0], rf: [15.5, 0], lh: [-2, 0], rh: [-0.5, 0] },
    thigh: { lh: rad(24), rh: rad(22) },
    haunch: 1,
    tail: { base: rad(150), curl: rad(-13), sway: rad(1.2), freq: 0.4, flick: 0 },
  };
}

export function loafPose(asleep: boolean): Pose {
  return {
    ...basePose(),
    S: [16, -16],
    H: [-15, -14],
    arch: 2.5,
    belly: -4,
    head: [16, -10],
    hAng: rad(8),
    feet: { lf: [25, -1], rf: [26, -1], lh: [-6, -1.5], rh: [-4, -1.5] },
    bend: { lf: 1, rf: 1 },
    thigh: { lh: rad(30), rh: rad(28) },
    haunch: 0.7,
    tuck: 1,
    eye: asleep ? 0 : 0.45,
    tail: { base: rad(165), curl: rad(-13), sway: rad(0.6), freq: 0.3, flick: 0 },
  };
}

/** The play bow of a long stretch. */
export function bowPose(): Pose {
  return {
    ...basePose(),
    S: [21, -14],
    H: [-18, -30],
    arch: -4.5,
    head: [17, -5],
    hAng: rad(-6),
    feet: { lf: [40, 0], rf: [37, 0], lh: [-14, 0], rh: [-12, 0] },
    thigh: { lh: rad(78), rh: rad(76) },
    tail: { base: rad(-96), curl: rad(3), sway: rad(2), freq: 0.5, flick: 0 },
  };
}

export function sniffPose(): Pose {
  return {
    ...basePose(),
    S: [19, -24.5],
    H: [-19, -27.5],
    head: [18, 12],
    hAng: rad(32),
    feet: { lf: [22, 0], rf: [24, 0], lh: [-16, 0], rh: [-14, 0] },
    tail: { base: rad(170), curl: rad(-7), sway: rad(3), freq: 0.7, flick: 0 },
  };
}

export function crouchPose(): Pose {
  return {
    ...basePose(),
    S: [18, -18],
    H: [-17, -21],
    arch: 1.5,
    head: [19, -9],
    hAng: rad(-18),
    feet: { lf: [24, 0], rf: [26, 0], lh: [-12, 0], rh: [-10, 0] },
    thigh: { lh: rad(40), rh: rad(38) },
    haunch: 0.5,
    tail: { base: rad(176), curl: rad(-2), sway: rad(2), freq: 1.2, flick: 0 },
    excite: 1,
  };
}

export function leapPose(): Pose {
  return {
    ...basePose(),
    S: [21, -31],
    H: [-19, -24],
    arch: -1,
    head: [21, -16],
    hAng: rad(-14),
    feet: { lf: [36, -22], rf: [38, -19], lh: [-30, -6], rh: [-28, -4] },
    bend: { lf: 0.2, rf: 0.2 },
    thigh: { lh: rad(118), rh: rad(116) },
    tail: { base: rad(178), curl: rad(-2), sway: 0, freq: 1, flick: 0 },
    excite: 1,
  };
}
