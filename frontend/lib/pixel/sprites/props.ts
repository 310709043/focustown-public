/**
 * Ambient prop sprites — small pixel items that drift through the
 * login scene (coffee cup, music note) and decorate corners of the
 * town (moon, sun, tree, lamp, tomato, star). Ported verbatim from
 * `reference/sprites.jsx`.
 */

import type { Palette } from "@/lib/pixel/sprite";

export interface SpriteDef {
  readonly sprite: string;
  readonly palette: Palette;
}

/* Moon — pixel art, replaces gradient circles on login + town. */
export const MOON: SpriteDef = {
  sprite: `
....YYYY....
...YYYYYYY..
..YYYYYBBYY.
.YYYYYYBYYY.
YYYYYYYYYYY.
YYYYBBYYYYY.
YYYYBBYYYYY.
YYYYYYYYYYY.
.YYYYYBYYY..
..YYYYYY....
....YYYY....
`,
  palette: { Y: "#fef9c3", B: "#fcd34d" },
};

/* Sun — daytime celestial. */
export const SUN: SpriteDef = {
  sprite: `
....YYYY....
...YYYYYYY..
..YYYYYYYYY.
.YYYYYYYYYY.
YYYYYYYYYYYY
YYYYYYYYYYYY
YYYYYYYYYYYY
YYYYYYYYYYYY
.YYYYYYYYYY.
..YYYYYYYYY.
...YYYYYYY..
....YYYY....
`,
  palette: { Y: "#fcd34d" },
};

/* Coffee cup — floats across login scene at 0.85 opacity. */
export const COFFEE: SpriteDef = {
  sprite: `
.WWWWWWWW.
.W......W.
.W.RRRR.W.
.W.RRRR.W.
.W.BBBB.W.
.WWWWWWWW.
..WWWWWW..
`,
  palette: { W: "#f5f3ff", R: "#7c4a2a", B: "#92400e" },
};

/* Music note — secondary drifting ornament, paired with COFFEE. */
export const NOTE: SpriteDef = {
  sprite: `
..NN.
.NNN.
NNN..
NN...
NN...
NNNN.
.NN..
`,
  palette: { N: "#22d3ee" },
};

/* Tiny 3×3 star — used in tagline prefix and tab dots. */
export const STAR_TINY: SpriteDef = {
  sprite: `
.Y.
YYY
.Y.
`,
  palette: { Y: "#fcd34d" },
};

/* Standalone star — bigger 5×5 version for nav badges. */
export const STAR: SpriteDef = {
  sprite: `
..Y..
.YYY.
YYYYY
.YYY.
..Y..
`,
  palette: { Y: "#fcd34d" },
};

/* Pomodoro tomato — used in user pill + buddy room timer. */
export const TOMATO: SpriteDef = {
  sprite: `
....GGG....
...GGGGG...
..RRRRRRR..
.RRRRWRRRR.
.RRWWWWRRR.
RRRWRRRRRR.
RRRRRRRRRR.
RRRRRRRRRR.
.RRRRRRRR..
..RRRRRR...
...RRRR....
`,
  palette: { R: "#dc2626", G: "#15803d", W: "#fca5a5" },
};

/* Trophy — achievements modal icon. */
export const TROPHY: SpriteDef = {
  sprite: `
.YYYYYYY.
.YWWWWWY.
.YWWWWWY.
.YWWWWWY.
B.YYYYY.B
B..YYY..B
.B.YYY.B.
...YYY...
..YYYYY..
.YYYYYYY.
`,
  palette: { Y: "#fcd34d", W: "#fff", B: "#fcd34d" },
};
