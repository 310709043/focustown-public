/**
 * Walking citizens + cat companion — 2-frame loop sprites ported verbatim
 * from `reference/sprites.jsx`. Each `WalkerDef` carries both frames so the
 * existing `AnimatedSprite` primitive can cycle them at any fps.
 *
 * Color codes inside the sprite strings:
 *   H = outline, F = face/skin, N = eyes, C = collar, B = body,
 *   L = lower body, S = legs
 */

import type { Palette } from "@/lib/pixel/sprite";

export interface WalkerDef {
  readonly frames: readonly [string, string];
  readonly palette: Palette;
}

const FRAME_1 = `
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

const FRAME_2 = `
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

function buildWalker(palette: Palette): WalkerDef {
  return { frames: [FRAME_1, FRAME_2], palette };
}

export const WALKERS: readonly WalkerDef[] = [
  buildWalker({ H: "#0a0524", F: "#f4c7a8", N: "#0a0524", C: "#ec4899", B: "#ec4899", L: "#1a0f3d", S: "#0a0524" }),
  buildWalker({ H: "#0a0524", F: "#fbbf24", N: "#0a0524", C: "#22d3ee", B: "#22d3ee", L: "#1a0f3d", S: "#0a0524" }),
  buildWalker({ H: "#0a0524", F: "#f4c7a8", N: "#0a0524", C: "#a78bfa", B: "#a78bfa", L: "#3f3a5a", S: "#0a0524" }),
  buildWalker({ H: "#0a0524", F: "#86efac", N: "#0a0524", C: "#fbbf24", B: "#fbbf24", L: "#1a0f3d", S: "#0a0524" }),
  buildWalker({ H: "#0a0524", F: "#f4c7a8", N: "#0a0524", C: "#fb923c", B: "#fb923c", L: "#1a0f3d", S: "#0a0524" }),
  buildWalker({ H: "#0a0524", F: "#fcd34d", N: "#0a0524", C: "#dc2626", B: "#dc2626", L: "#1a0f3d", S: "#0a0524" }),
  buildWalker({ H: "#0a0524", F: "#f4c7a8", N: "#0a0524", C: "#06d6a0", B: "#06d6a0", L: "#1a0f3d", S: "#0a0524" }),
  buildWalker({ H: "#0a0524", F: "#f4c7a8", N: "#0a0524", C: "#f0abfc", B: "#f0abfc", L: "#3f3a5a", S: "#0a0524" }),
];

export const CAT_WALK: WalkerDef = {
  frames: [
    `
..BBBBBB..
.BWWWWWWB.
BWBWBBWBWB
BWWWWWWWWB
.BWWWWWWB.
.BBBBBBBB.
B........B
.B......B.
`,
    `
..BBBBBB..
.BWWWWWWB.
BWBWBBWBWB
BWWWWWWWWB
.BWWWWWWB.
.BBBBBBBB.
.B......B.
B........B
`,
  ],
  palette: { B: "#0a0524", W: "#fcd34d" },
};
