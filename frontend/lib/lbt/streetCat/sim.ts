/**
 * The street cat's day: mostly walking, with short stops to sit, groom,
 * stretch, sniff or chase a butterfly; after dark it keeps to the light of
 * street lamp 07 and dozes there. Blinks and ear twitches run on their own.
 * Positions are street units (Townscape's 1200-wide drawing, ground y 190).
 */
import type { TownTime, TownWeek } from "../townTime";

import { groom, loaf, look, pounce, rest, sit, sniff, stretch, turnAround, walkTo, type Act, type Body } from "./acts";
import { clamp, smooth } from "./geometry";
import { lerpPose, type Pose } from "./poses";

export interface CatWorld {
  time: TownTime;
  week: TownWeek;
  /** prefers-reduced-motion: the cat sits still */
  reduced: boolean;
}

export interface Bug {
  start: number;
  alpha: number;
  x: number;
  y: number;
}

export interface Sim extends Body {
  t: number;
  act: Act | null;
  pose: Pose | null;
  prevPose: Pose | null;
  blendT: number;
  lastMove: boolean;
  blink: number;
  nextBlink: number;
  earTwitch: number;
  nextTwitch: number;
  bug: Bug | null;
  rng: () => number;
}

/** Centre of lamp 07's pool of light on each street (lamp x + 40). */
export const LAMP_POOL: Record<TownWeek, number> = { weekday: 793, weekend: 803 };
/** Paws touch the ground strip here. */
export const GROUND_Y = 197;
/** Clear of the stage's rounded corners. */
export const WALK_MIN = 90;
export const WALK_MAX = 1110;
/** Street units per cat unit: a small cat, about 48 street units tall. */
export const CAT_SCALE = 0.82;
const BLEND_S = 0.38;

export function createSim(rng: () => number = Math.random, x = 480): Sim {
  return {
    x,
    dir: 1,
    flip: 1,
    phase: 0,
    scale: CAT_SCALE,
    t: 0,
    act: null,
    pose: null,
    prevPose: null,
    blendT: 1,
    lastMove: false,
    blink: 1,
    nextBlink: 2,
    earTwitch: 0,
    nextTwitch: 3,
    bug: null,
    rng,
  };
}

const between = (sim: Sim, lo: number, hi: number) => lo + sim.rng() * (hi - lo);
const atLamp = (sim: Sim, world: CatWorld) => Math.abs(sim.x - LAMP_POOL[world.week]) < 90;

function pickTarget(sim: Sim, world: CatWorld): number {
  const lamp = LAMP_POOL[world.week];
  const toLamp = world.time === "night" ? 0.65 : world.time === "dusk" ? 0.4 : 0.12;
  if (sim.rng() < toLamp && Math.abs(sim.x - lamp) > 60) return clamp(lamp + between(sim, -50, 50), WALK_MIN, WALK_MAX);
  let target = sim.x;
  for (let i = 0; i < 20 && Math.abs(target - sim.x) < 160; i += 1) target = between(sim, WALK_MIN, WALK_MAX);
  return target;
}

function weighted(sim: Sim, weights: Record<string, number>): string {
  const entries = Object.entries(weights);
  let r = sim.rng() * entries.reduce((sum, [, w]) => sum + w, 0);
  for (const [name, w] of entries) {
    r -= w;
    if (r <= 0) return name;
  }
  return entries[0]?.[0] ?? "sit";
}

function idle(sim: Sim, world: CatWorld): Act {
  const weights: Record<string, number> =
    world.time === "night"
      ? atLamp(sim, world)
        ? { sleep: 2, loaf: 2, groom: 2, pounce: 2, look: 2, sit: 1 }
        : { sniff: 2, sit: 2, look: 1 }
      : world.time === "dawn"
        ? { stretch: 3, sit: 2, sniff: 1, look: 1 }
        : world.time === "dusk"
          ? { sit: 2, look: 2, groom: 1, sniff: 1, pounce: 1 }
          : { stretch: 2, sniff: 2, sit: 2, look: 2, groom: 1, pounce: 2, loaf: 1 };
  switch (weighted(sim, weights)) {
    case "sleep":
      return loaf(true, between(sim, 9, 13));
    case "loaf":
      return loaf(false, between(sim, 6, 8));
    case "groom":
      return groom();
    case "pounce":
      sim.bug = { start: sim.t, alpha: 0, x: sim.x, y: 0 };
      return pounce();
    case "look":
      return look();
    case "stretch":
      return stretch();
    case "sniff":
      return sniff(between(sim, 2.4, 3.4));
    default:
      return sit(between(sim, 3.5, 5.5));
  }
}

function moveTo(sim: Sim, target: number, kind: "walk" | "trot"): Act {
  const walk = walkTo(target, kind);
  return (Math.sign(target - sim.x) || sim.dir) === sim.dir ? walk : turnAround(walk);
}

function chooseNext(sim: Sim, world: CatWorld): Act {
  if (world.reduced) return rest();
  if (sim.lastMove) {
    sim.lastMove = false;
    return idle(sim, world);
  }
  // after dark it lingers in the lamp's light: often another rest before it wanders off
  if (world.time === "night" && atLamp(sim, world) && sim.rng() < 0.6) return idle(sim, world);
  sim.lastMove = true;
  const trot = world.time !== "night" && sim.rng() < 0.16;
  return moveTo(sim, pickTarget(sim, world), trot ? "trot" : "walk");
}

function start(sim: Sim, act: Act): void {
  sim.prevPose = sim.pose;
  sim.act = act;
  sim.blendT = 0;
  if (act.name !== "pounce") sim.bug = null;
}

/** Without motion the cat simply sits somewhere sensible: in the lamp's light after dark. */
export function placeForRest(sim: Sim, world: CatWorld): void {
  sim.x = world.time === "night" || world.time === "dusk" ? LAMP_POOL[world.week] - 34 : 470;
  sim.dir = 1;
  sim.flip = 1;
  start(sim, rest());
}

/** Someone clicked the cat: it turns to face them and blinks slowly. */
export function lookAtViewer(sim: Sim): void {
  sim.lastMove = false;
  start(sim, look());
}

function lifeTick(sim: Sim): void {
  if (sim.t > sim.nextBlink) {
    const k = (sim.t - sim.nextBlink) / 0.17;
    sim.blink = k < 1 ? 1 - Math.sin(Math.PI * k) : 1;
    if (k >= 1) sim.nextBlink = sim.t + between(sim, 2.5, 6.5);
  }
  if (sim.t > sim.nextTwitch) {
    const k = (sim.t - sim.nextTwitch) / 0.28;
    sim.earTwitch = k < 1 ? -0.38 * Math.sin(Math.PI * k) : 0;
    if (k >= 1) sim.nextTwitch = sim.t + between(sim, 3.5, 9);
  }
}

/** The butterfly (moth at night) hovers ahead of the cat, then flees after the leap. */
function bugTick(sim: Sim): void {
  if (!sim.bug) return;
  const age = sim.t - sim.bug.start;
  if (age > 4.6) {
    sim.bug = null;
    return;
  }
  const s = sim.scale;
  sim.bug.alpha = clamp(age / 0.6, 0, 1) * (age > 3.2 ? clamp(1 - (age - 3.2) / 1.2, 0, 1) : 1);
  let x = sim.x + sim.dir * (40 + 6 * Math.sin(age * 2.1)) * s + 8 * Math.sin(age * 1.7) * s;
  let y = -(36 + 8 * Math.sin(age * 3.3) + 3 * Math.sin(age * 9)) * s;
  if (age > 2.5) {
    y -= 40 * (age - 2.5) * s;
    x += sim.dir * 30 * (age - 2.5) * s;
  }
  sim.bug.x = x;
  sim.bug.y = y;
}

/** Advance the cat by `dt` seconds and leave the pose to draw in `sim.pose`. */
export function stepSim(sim: Sim, world: CatWorld, dt: number): Pose {
  sim.t += dt;
  lifeTick(sim);
  if (world.reduced && sim.act?.name !== "rest" && sim.act?.name !== "look") placeForRest(sim, world);
  if (!sim.act) start(sim, chooseNext(sim, world));
  let pose = (sim.act as Act).update(sim, dt);
  if ((sim.act as Act).done) {
    start(sim, (sim.act as Act).then ?? chooseNext(sim, world));
    pose = (sim.act as Act).update(sim, 0);
  }
  if (sim.blendT < 1 && sim.prevPose) {
    sim.blendT = Math.min(1, sim.blendT + dt / BLEND_S);
    pose = lerpPose(sim.prevPose, pose, smooth(sim.blendT));
  }
  sim.pose = pose;
  bugTick(sim);
  return pose;
}

export interface Light {
  /** colour multipliers for the dimming filter */
  r: number;
  g: number;
  b: number;
  shadow: number;
  /** eye-shine in the dark */
  glow: number;
  /** 0 slit … 1 wide */
  pupil: number;
  /** 0 … 1: inside lamp 07's light */
  lamp: number;
}

export function lighting(sim: Sim, world: CatWorld): Light {
  const lamp = Math.exp(-(((sim.x - LAMP_POOL[world.week]) / 92) ** 2));
  switch (world.time) {
    case "day":
      return { r: 1, g: 1, b: 1, shadow: 0.24, glow: 0, pupil: 0.05, lamp };
    case "dawn":
      return { r: 0.96, g: 0.9, b: 0.95, shadow: 0.15, glow: 0.12, pupil: 0.35, lamp };
    case "dusk":
      return { r: 0.97 + 0.05 * lamp, g: 0.83 + 0.07 * lamp, b: 0.77 + 0.03 * lamp, shadow: 0.2, glow: 0.2 * (1 - lamp), pupil: 0.45, lamp };
    default: {
      const k = 0.33 + 0.67 * lamp;
      return { r: k * (1 + 0.07 * lamp), g: k * 0.97, b: k * (0.9 - 0.08 * lamp) + 0.07 * (1 - lamp), shadow: 0.06 + 0.3 * lamp, glow: 1 - lamp, pupil: 0.9, lamp };
    }
  }
}
