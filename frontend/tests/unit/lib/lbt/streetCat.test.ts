/**
 * The street cat's engine: the leg solver, feet that stay planted while
 * walking, and the cat's day (keeps moving, stays on the street, keeps to
 * the lamp after dark, sits still under reduced motion, looks up when
 * clicked). Drawing is not tested here.
 */
import { describe, expect, test } from "vitest";

import { ik2, len, sub } from "@/lib/lbt/streetCat/geometry";
import { GAITS, gaitPose } from "@/lib/lbt/streetCat/poses";
import {
  LAMP_POOL,
  WALK_MAX,
  WALK_MIN,
  createSim,
  lookAtViewer,
  stepSim,
  type CatWorld,
  type Sim,
} from "@/lib/lbt/streetCat/sim";

/** Deterministic random numbers (mulberry32). */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAY: CatWorld = { time: "day", week: "weekday", reduced: false };
const NIGHT: CatWorld = { time: "night", week: "weekday", reduced: false };

interface Run {
  moving: number;
  nearLamp: number;
  minX: number;
  maxX: number;
  finite: boolean;
}

function live(sim: Sim, world: CatWorld, seconds: number): Run {
  const frames = seconds * 30;
  let moving = 0;
  let nearLamp = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let finite = true;
  for (let i = 0; i < frames; i += 1) {
    const pose = stepSim(sim, world, 1 / 30);
    const name = sim.act?.name;
    if (name === "walk" || name === "trot") moving += 1;
    if (Math.abs(sim.x - LAMP_POOL[world.week]) < 90) nearLamp += 1;
    minX = Math.min(minX, sim.x);
    maxX = Math.max(maxX, sim.x);
    if (!Number.isFinite(pose.S[0] + pose.H[1] + pose.feet.lf[0] + pose.tail.base)) finite = false;
  }
  return { moving: moving / frames, nearLamp: nearLamp / frames, minX, maxX, finite };
}

describe("ik2", () => {
  test("keeps both bones their length when the target is in reach", () => {
    const [joint, end] = ik2([0, 0], [5, 18], 12, 10, 1);

    expect([len(joint), len(sub(end, joint))].map((n) => Math.round(n * 1000) / 1000)).toEqual([12, 10]);
  });

  test("reaches a target within reach", () => {
    const [, end] = ik2([0, 0], [5, 18], 12, 10, 1);

    expect(end.map((n) => Math.round(n * 1000) / 1000)).toEqual([5, 18]);
  });

  test("bends the joint behind the line for +1 and in front of it for -1", () => {
    const behind = ik2([0, 0], [0, 18], 12, 10, 1)[0][0];
    const ahead = ik2([0, 0], [0, 18], 12, 10, -1)[0][0];

    expect([behind < 0, ahead > 0]).toEqual([true, true]);
  });

  test("stretches straight towards a target out of reach instead of failing", () => {
    const [, end] = ik2([0, 0], [0, 100], 12, 10, 1);

    expect(Math.round(len(end))).toBe(22);
  });
});

describe("walking", () => {
  test("a planted paw does not slide along the street", () => {
    const g = GAITS.walk;
    const speed = g.stride / (g.duty * g.period);
    const world = Array.from({ length: 40 }, (_, i) => {
      const phase = (i / 40) * g.duty * 0.98;
      return speed * phase * g.period + gaitPose(phase, "walk").feet.lh[0];
    });

    expect(Math.max(...world) - Math.min(...world)).toBeLessThan(0.01);
  });

  test("a paw in the air is lifted off the ground", () => {
    const g = GAITS.walk;

    expect(gaitPose(g.duty + (1 - g.duty) / 2, "walk").feet.lh[1]).toBeLessThan(-3);
  });
});

describe("the cat's day", () => {
  test("by day it is on the move most of the time", () => {
    const run = live(createSim(seeded(1)), DAY, 300);

    expect(run.moving).toBeGreaterThan(0.4);
  });

  test("it never leaves the street", () => {
    const run = live(createSim(seeded(2)), DAY, 300);

    expect([run.minX >= WALK_MIN - 1, run.maxX <= WALK_MAX + 30]).toEqual([true, true]);
  });

  test("every pose is a real number", () => {
    expect(live(createSim(seeded(3)), NIGHT, 300).finite).toBe(true);
  });

  test("after dark it keeps to lamp 07's light more than by day", () => {
    const night = live(createSim(seeded(4)), NIGHT, 300).nearLamp;
    const day = live(createSim(seeded(4)), DAY, 300).nearLamp;

    expect(night).toBeGreaterThan(day + 0.15);
  });

  test("under reduced motion it sits still in one place", () => {
    const sim = createSim(seeded(5));
    stepSim(sim, { ...NIGHT, reduced: true }, 1 / 30);
    const x = sim.x;

    const run = live(sim, { ...NIGHT, reduced: true }, 60);

    expect([run.moving, run.minX, run.maxX]).toEqual([0, x, x]);
  });

  test("clicked, it stops to face the viewer", () => {
    const sim = createSim(seeded(6));
    live(sim, DAY, 5);
    lookAtViewer(sim);

    live(sim, DAY, 1.2);

    expect([sim.act?.name, (sim.pose?.turn ?? 0) > 0.9]).toEqual(["look", true]);
  });
});
