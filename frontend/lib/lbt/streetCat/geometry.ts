/** Small 2D helpers for the street cat's rig. Units are the cat's own (about 58 tall). */

export type Vec = [number, number];

export const TAU = Math.PI * 2;
export const rad = (deg: number) => (deg * Math.PI) / 180;
export const deg = (r: number) => (r * 180) / Math.PI;
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (t: number) => t * t * (3 - 2 * t);
export const frac = (x: number) => x - Math.floor(x);
export const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1]];
export const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1]];
export const mul = (a: Vec, k: number): Vec => [a[0] * k, a[1] * k];
export const len = (a: Vec) => Math.hypot(a[0], a[1]);
export const norm = (a: Vec): Vec => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l];
};
export const dirv = (angle: number): Vec => [Math.cos(angle), Math.sin(angle)];

/** Two decimals, as SVG attribute text. */
export const f2 = (n: number) => (Math.round(n * 100) / 100).toString();
export const pt = (p: Vec) => `${f2(p[0])} ${f2(p[1])}`;

/**
 * Two-bone inverse kinematics: from `root` towards `target` with bones `a`
 * and `b`. `bend` +1 puts the joint behind the line (a hock, a standing
 * wrist), -1 in front of it (a wrist folding in a step); values between
 * blend the two. Returns [joint, end]; `end` reaches `target` when it can.
 */
export function ik2(root: Vec, target: Vec, a: number, b: number, bend: number): [Vec, Vec] {
  const v = sub(target, root);
  const d = clamp(len(v), Math.abs(a - b) + 0.01, a + b - 0.01);
  const toward = Math.atan2(v[1], v[0]);
  const spread = Math.acos(clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1));
  const joint = add(root, mul(dirv(toward + bend * spread), a));
  return [joint, add(joint, mul(norm(sub(target, joint)), b))];
}

/** A smooth closed outline through `points` (Catmull-Rom as cubic Béziers). */
export function closedPath(points: readonly Vec[]): string {
  const n = points.length;
  let d = `M${pt(points[0] as Vec)}`;
  for (let i = 0; i < n; i += 1) {
    const p0 = points[(i - 1 + n) % n] as Vec;
    const p1 = points[i] as Vec;
    const p2 = points[(i + 1) % n] as Vec;
    const p3 = points[(i + 2) % n] as Vec;
    const c1: Vec = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Vec = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${pt(c1)} ${pt(c2)} ${pt(p2)}`;
  }
  return `${d}Z`;
}
