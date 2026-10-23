/**
 * What the cat does. Each act returns a pose for every frame and says when
 * it is done; walking acts also move the cat along the street. Closures
 * hold each act's own clock, so acts can be blended and replaced freely.
 */
import { TAU, clamp, frac, lerp, rad, smooth } from "./geometry";
import {
  basePose,
  bowPose,
  crouchPose,
  GAITS,
  gaitPose,
  gaitSpeed,
  leapPose,
  lerpPose,
  loafPose,
  sitPose,
  sniffPose,
  type Gait,
  type Pose,
} from "./poses";

export type ActName =
  | "walk"
  | "trot"
  | "turn"
  | "sit"
  | "look"
  | "groom"
  | "stretch"
  | "sniff"
  | "loaf"
  | "sleep"
  | "pounce"
  | "rest";

/** The part of the simulation an act may move. */
export interface Body {
  x: number;
  dir: 1 | -1;
  /** -1 … 1 while turning round; ±1 otherwise */
  flip: number;
  phase: number;
  /** street units per cat unit */
  scale: number;
}

export interface Act {
  readonly name: ActName;
  readonly target?: number;
  /** an act to start when this one ends (a turn before a walk) */
  readonly then?: Act;
  done: boolean;
  update(body: Body, dt: number): Pose;
}

/** Walk or trot to `target` (street units), then stop. */
export function walkTo(target: number, kind: Gait): Act {
  const act: Act = {
    name: kind,
    target,
    done: false,
    update(body, dt) {
      const left = (target - body.x) * body.dir;
      if (left <= 0.5) act.done = true;
      else {
        body.x += body.dir * Math.min(left, gaitSpeed(kind) * body.scale * dt);
        body.phase = frac(body.phase + dt / GAITS[kind].period);
      }
      return gaitPose(body.phase, kind);
    },
  };
  return act;
}

/** Turn round on the spot, glancing at the viewer halfway. */
export function turnAround(then?: Act): Act {
  let t = 0;
  let from: 1 | -1 | 0 = 0;
  const act: Act = {
    name: "turn",
    then,
    target: then?.target,
    done: false,
    update(body, dt) {
      if (from === 0) from = body.dir;
      t += dt;
      const k = clamp(t / 0.62, 0, 1);
      if (k >= 0.5 && body.dir === from) body.dir = from === 1 ? -1 : 1;
      body.flip = Math.cos(Math.PI * k) * from;
      if (k >= 1) {
        body.flip = body.dir;
        act.done = true;
      }
      const p = basePose();
      p.turn = Math.sin(Math.PI * k);
      p.tail.sway = rad(9);
      return p;
    },
  };
  return act;
}

function timed(name: ActName, dur: number, pose: (t: number, dur: number, body: Body) => Pose): Act {
  let t = 0;
  const act: Act = {
    name,
    done: false,
    update(body, dt) {
      t += dt;
      if (t >= dur) act.done = true;
      return pose(Math.min(t, dur), dur, body);
    },
  };
  return act;
}

const ramp = (t: number, start: number, length: number) => smooth(clamp((t - start) / length, 0, 1));
/** 0 → 1 → 0: in from `inAt`, out from `outAt`, each over `fade` seconds. */
const held = (t: number, inAt: number, outAt: number, fade: number) => ramp(t, inAt, fade) * (1 - ramp(t, outAt, fade));

export function sit(dur: number): Act {
  return timed("sit", dur, (t) => {
    const p = sitPose();
    // a glance at the viewer, a look up, the tail tip flicking
    p.turn = 0.4 * held(t, 1.2, 2.4, 0.4);
    p.hAng += rad(-10) * Math.sin(clamp((t - 2.8) / 1.6, 0, 1) * Math.PI);
    p.tail.flick = t > 1 ? rad(28) * Math.max(0, Math.sin(t * 5.2)) : 0;
    return p;
  });
}

/** Turn to face the viewer and blink slowly, twice: a cat's way of saying it trusts you. */
export function look(): Act {
  return timed("look", 4.6, (t) => {
    const p = sitPose();
    p.turn = held(t, 0, 4.0, 0.5);
    const blink = (at: number) => {
      const x = t - at;
      if (x < 0 || x > 1.3) return 1;
      if (x < 0.45) return 1 - 0.9 * smooth(x / 0.45);
      return x < 0.75 ? 0.1 : 0.1 + 0.9 * smooth((x - 0.75) / 0.55);
    };
    p.eye = Math.min(blink(1.0), blink(2.6));
    p.hAng = rad(-6);
    p.tail.flick = rad(18) * Math.max(0, Math.sin(t * 3));
    return p;
  });
}

/** Lick a paw, then wash the face with it. */
export function groom(): Act {
  return timed("groom", 5.6, (t) => {
    const p = sitPose();
    const lift = held(t, 0, 5.0, 0.5);
    const lick = Math.sin(t * TAU * 2.6);
    const wash = Math.sin(clamp((t - 3) / 1.6, 0, 1) * Math.PI);
    p.feet.lf = [lerp(13.5, 29, lift) - 3 * wash, lerp(0, -30, lift) - 1.2 * lick * (1 - wash) - 8 * wash];
    p.bend.lf = 0.9 * lift;
    p.hAng = rad(-4) + lift * (rad(38) + rad(5) * lick * (1 - wash) - rad(30) * wash);
    p.head = [13.5 + 1.5 * lift, -19.5 + 1.5 * lift];
    p.tongue = lift * (1 - wash) * Math.max(0, lick);
    p.eye = lerp(1, 0.35, lift);
    return p;
  });
}

/** Play bow and a yawn. */
export function stretch(): Act {
  return timed("stretch", 3.8, (t) => {
    const p = lerpPose(basePose(), bowPose(), held(t, 0, 3.0, 0.75));
    const yawn = Math.sin(clamp((t - 0.9) / 1.4, 0, 1) * Math.PI);
    p.mouth = yawn;
    p.eye = lerp(1, 0.08, Math.max(yawn, 0.5 * held(t, 0, 3.0, 0.75)));
    p.hAng += rad(-16) * yawn;
    p.earN = rad(-14) * yawn;
    p.earF = rad(-14) * yawn;
    return p;
  });
}

export function sniff(dur: number): Act {
  return timed("sniff", dur, (t, d) => {
    const k = held(t, 0, d - 0.5, 0.5);
    const p = lerpPose(basePose(), sniffPose(), k);
    const twitch = Math.sin(t * TAU * 6) * (Math.sin(t * 2.3) > 0.2 ? 1 : 0);
    p.head = [p.head[0] + 0.6 * twitch * k, p.head[1] + 0.3 * twitch * k];
    p.hAng += rad(4) * Math.sin(t * 1.7) * k;
    return p;
  });
}

/** Settle into a loaf; asleep, the eyes close and the breathing slows. */
export function loaf(asleep: boolean, dur: number): Act {
  return timed(asleep ? "sleep" : "loaf", dur, (t, d) => {
    const p = lerpPose(sitPose(), loafPose(asleep), held(t, 0, d - 1.0, 1.0));
    p.eye = lerp(1, asleep ? 0 : 0.45, held(t, 0.6, d - 1.2, 1.2));
    p.breathe = 1 + 0.025 * Math.sin(t * TAU * 0.32);
    return p;
  });
}

/** The leap's length, cat units. */
export const POUNCE_REACH = 28;

/** Watch, wiggle, leap, land, look pleased. The leap's distance is handed to the walk position at the end. */
export function pounce(): Act {
  let moved = false;
  return timed("pounce", 4.6, (t, d, body) => {
    let p: Pose;
    if (t < 1.4) {
      p = lerpPose(basePose(), crouchPose(), ramp(t, 0, 0.5));
      p.hAng = rad(-18) + rad(-14) * Math.sin(t * 2.2);
    } else if (t < 2.3) {
      p = crouchPose();
      const wiggle = Math.sin((t - 1.4) * TAU * 3.4);
      p.H = [p.H[0] + 1.3 * wiggle, p.H[1] - 0.7 * Math.abs(wiggle)];
      p.tail.flick = rad(30) * Math.max(0, Math.sin((t - 1.4) * 14));
    } else if (t < 3.0) {
      const k = (t - 2.3) / 0.7;
      p = lerpPose(crouchPose(), leapPose(), smooth(Math.min(1, k * 2.2)));
      if (k > 0.55) p = lerpPose(p, crouchPose(), smooth((k - 0.55) / 0.45));
      p.rootY = -30 * Math.sin(Math.PI * k);
      p.rootX = POUNCE_REACH * smooth(k);
    } else {
      p = lerpPose(crouchPose(), sitPose(), ramp(t, 3.0, 0.6));
      p.rootX = POUNCE_REACH;
      p.turn = 0.5 * Math.sin(clamp((t - 3.4) / 1.2, 0, 1) * Math.PI);
    }
    if (t >= d && !moved) {
      moved = true;
      body.x += body.dir * POUNCE_REACH * body.scale;
      p.rootX = 0;
    }
    return p;
  });
}

/** Without motion: sit still; only the blinks and ear twitches remain. */
export function rest(): Act {
  return timed("rest", 6, () => {
    const p = sitPose();
    p.tail.sway = 0;
    return p;
  });
}
