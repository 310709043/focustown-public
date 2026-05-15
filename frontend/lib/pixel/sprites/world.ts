/**
 * World sprites — citizens, cat, tree, bench, lamp, cars, celestial
 * bodies, and small UI icons. Ported from `reference/sprites.jsx`.
 *
 * Most entries split into a `{frames, palette}` shape (animated) or
 * a `{sprite, palette}` shape (static). The keys in each palette are
 * intentionally short single-character codes; downstream code passes
 * the sprite + palette to `<PixelSprite>` / `<AnimatedSprite>` without
 * needing to know the keys.
 */

import type { Palette } from "@/lib/pixel/sprite";

export interface SpriteDef {
  readonly sprite: string;
  readonly palette: Palette;
}

export interface AnimatedSpriteDef {
  readonly frames: readonly string[];
  readonly palette: Palette;
}

// ---------- Walking citizens (8×14, 2-frame walk cycle) ----------

const WALKER_F1 = `
.HHHHH..
.HFFFH..
.HFNNFH.
.HFFFH..
HHCCCCH.
HCBBBCH.
HCBBBCH.
HCBBBCH.
HCBBBCH.
HHCCCCH.
.HLLLH..
.HLLLH..
.HSSSH..
.HS.SH..
`;

const WALKER_F2 = `
.HHHHH..
.HFFFH..
.HFNNFH.
.HFFFH..
HHCCCCH.
HCBBBCH.
HCBBBCH.
HCBBBCH.
HCBBBCH.
HHCCCCH.
.HLLLH..
.HLL.H..
.HSSSH..
.H.SSH..
`;

function buildWalker(palette: Palette): AnimatedSpriteDef {
  return { frames: [WALKER_F1, WALKER_F2], palette };
}

export const WALKERS: readonly AnimatedSpriteDef[] = [
  buildWalker({ H: "#0a0524", F: "#f4c7a8", N: "#0a0524", C: "#ec4899", B: "#ec4899", L: "#1a0f3d", S: "#0a0524" }),
  buildWalker({ H: "#0a0524", F: "#fbbf24", N: "#0a0524", C: "#22d3ee", B: "#22d3ee", L: "#1a0f3d", S: "#0a0524" }),
  buildWalker({ H: "#0a0524", F: "#f4c7a8", N: "#0a0524", C: "#a78bfa", B: "#a78bfa", L: "#3f3a5a", S: "#0a0524" }),
  buildWalker({ H: "#0a0524", F: "#86efac", N: "#0a0524", C: "#fbbf24", B: "#fbbf24", L: "#1a0f3d", S: "#0a0524" }),
  buildWalker({ H: "#0a0524", F: "#f4c7a8", N: "#0a0524", C: "#fb923c", B: "#fb923c", L: "#1a0f3d", S: "#0a0524" }),
  buildWalker({ H: "#0a0524", F: "#fcd34d", N: "#0a0524", C: "#dc2626", B: "#dc2626", L: "#1a0f3d", S: "#0a0524" }),
  buildWalker({ H: "#0a0524", F: "#f4c7a8", N: "#0a0524", C: "#06d6a0", B: "#06d6a0", L: "#1a0f3d", S: "#0a0524" }),
  buildWalker({ H: "#0a0524", F: "#f4c7a8", N: "#0a0524", C: "#f0abfc", B: "#f0abfc", L: "#3f3a5a", S: "#0a0524" }),
];

// ---------- Companion dog (10×8, 2-frame walk cycle) ----------
// Side-view; body slightly longer than the cat, tail held high so a glance
// distinguishes the two. Palette key: B = outline, T = tan body.

export const DOG_WALK: AnimatedSpriteDef = {
  frames: [`
.....BBBB.
....BBTTBB
BBBBBBTTTB
BTTTBBTTTB
BTTTTTTTTB
BTTTTTTTTB
BBBBBBBBBB
B.B....B.B
`, `
.....BBBB.
....BBTTBB
BBBBBBTTTB
BTTTBBTTTB
BTTTTTTTTB
BTTTTTTTTB
BBBBBBBBBB
.B.B..B.B.
`],
  palette: { B: "#0a0524", T: "#c2a479" },
};

// ---------- Songbird (6×4, 2-frame wing flap) ----------
// Tiny silhouette so it reads as flying past at altitude; the wing position
// flips between frames to suggest a continuous flap.

export const BIRD_FLY: AnimatedSpriteDef = {
  frames: [`
W....W
.W.BW.
.BBBB.
......
`, `
......
.W.BW.
.BBBB.
W....W
`],
  palette: { W: "#94a3b8", B: "#1e40af" },
};

// ---------- Companion cat ----------

export const CAT_WALK: AnimatedSpriteDef = {
  frames: [`
..BBBBBB..
.BWWWWWWB.
BWBWBBWBWB
BWWWWWWWWB
.BWWWWWWB.
.BBBBBBBB.
B........B
.B......B.
`, `
..BBBBBB..
.BWWWWWWB.
BWBWBBWBWB
BWWWWWWWWB
.BWWWWWWB.
.BBBBBBBB.
.B......B.
B........B
`],
  palette: { B: "#0a0524", W: "#fcd34d" },
};

// ---------- Street props ----------

export const TREE: SpriteDef = {
  sprite: `
...GGG...
..GGGGG..
.GGGGGGG.
GGGGGGGGG
.GGGGGGG.
..GGGGG..
...GGG...
....B....
....B....
....B....
`,
  palette: { G: "#15803d", B: "#3a2820" },
};

export const BENCH: SpriteDef = {
  sprite: `
BBBBBBBB
BBBBBBBB
.B....B.
.B....B.
.B....B.
`,
  palette: { B: "#3a2820" },
};

export const LAMP: SpriteDef = {
  sprite: `
.YYY.
YYBYY
YYBYY
.YBY.
..B..
..B..
..B..
..B..
..B..
`,
  palette: { Y: "#fcd34d", B: "#1a0f3d" },
};

// ---------- Cars (2-frame body w/ wheel-turn flicker) ----------

const CAR_F1 = `
.....XXXXXXXX....
....XXXXXXXXXX...
...XXXXXXXXXXXX..
..XXXWWWXWWWXXX..
.XXXXWWWXWWWXXXX.
XXXXXXXXXXXXXXXXX
.KKKXXXXXXXXKKK..
..KK........KK...
`;

const CAR_F2 = `
.....XXXXXXXX....
....XXXXXXXXXX...
...XXXXXXXXXXXX..
..XXXWWWXWWWXXX..
.XXXXWWWXWWWXXXX.
XXXXXXXXXXXXXXXXX
..KKXXXXXXXXKK...
.KK..........KK..
`;

export function buildCar(body: string, window = "#a78bfa"): AnimatedSpriteDef {
  return {
    frames: [CAR_F1, CAR_F2],
    palette: { X: body, W: window, K: "#0a0524" },
  };
}

// ---------- Celestial bodies ----------

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

// ---------- Small UI icons ----------

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
