/**
 * The street cat's SVG: built once, then moved every frame by setting
 * attributes from a pose. A calico (white, with orange and black patches),
 * drawn in the cat's own units and placed on the street by one transform.
 * Static shapes only — nothing here ever comes from user input.
 */
import { BONE, TAIL_N, TAIL_SEG, type Pose } from "./poses";
import { TAU, add, clamp, closedPath, deg, dirv, f2, ik2, lerp, mul, norm, pt, smooth, sub, type Vec } from "./geometry";
import type { Light, Sim } from "./sim";

const NS = "http://www.w3.org/2000/svg";

const COAT = {
  base: "#f2ece2",
  top: "#e6ded2",
  light: "#ffffff",
  far: "#cdc3b6",
  farEar: "#b9763b",
  eye: "#d8b64b",
  nose: "#e3a3a0",
  inner: "#efb4ae",
  whisker: "#ffffff",
  muzzle: "#ffffff",
  ink: "#5a3b33",
  orange: "#df8f47",
  black: "#2f2d33",
} as const;

type Attrs = Record<string, string | number>;

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs, parent?: Element): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent?.appendChild(node);
  return node;
}
function set(node: Element, attrs: Attrs): void {
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
}
const line = (parent: Element, width: number, color: string) =>
  el("line", { "stroke-linecap": "round", "stroke-width": width, stroke: color }, parent);

interface LegParts {
  g: SVGGElement;
  thigh?: SVGLineElement;
  a: SVGLineElement;
  b: SVGLineElement;
  paw: SVGEllipseElement;
}

export interface Rig {
  place: SVGGElement;
  flip: SVGGElement;
  /** the clickable cat */
  hit: SVGGElement;
  shadow: SVGEllipseElement;
  fn: SVGFEFuncRElement[];
  tail: SVGLineElement[];
  farH: LegParts;
  farF: LegParts;
  nearH: LegParts;
  nearF: LegParts;
  haunch: SVGEllipseElement;
  body: SVGPathElement;
  clip: SVGPathElement;
  patchA: SVGEllipseElement;
  patchB: SVGEllipseElement;
  neck: SVGLineElement;
  head: SVGGElement;
  glintHead: SVGGElement;
  side: SVGGElement;
  front: SVGGElement;
  sEarN: SVGGElement;
  sEarF: SVGGElement;
  sEye: SVGGElement;
  sPupil: SVGEllipseElement;
  sLid: SVGPathElement;
  sMouthOpen: SVGEllipseElement;
  sTongue: SVGEllipseElement;
  fEyes: { g: SVGGElement; pupil: SVGEllipseElement; x: number }[];
  glintSide: SVGCircleElement;
  glintFront: SVGCircleElement[];
}

function leg(parent: Element, fore: boolean, color: string): LegParts {
  const g = el("g", {}, parent);
  const thigh = fore ? undefined : line(g, 9, color);
  const a = line(g, fore ? 6.4 : 5.2, color);
  const b = line(g, fore ? 4.3 : 3.9, color);
  const paw = el("ellipse", { rx: 3.6, ry: 2.2, fill: color }, g);
  return { g, thigh, a, b, paw };
}

function sideHead(r: Partial<Rig>, parent: Element, id: string): SVGGElement {
  const s = el("g", {}, parent);
  r.sEarF = el("g", {}, s);
  el("path", { d: "M-1.2 -6 L2.4 -17.2 L6.6 -5.8 Z", fill: COAT.farEar }, r.sEarF);
  el("ellipse", { cx: 0, cy: 0, rx: 10, ry: 8.8, fill: COAT.base }, s);
  el("ellipse", { cx: 3, cy: 3.5, rx: 8, ry: 6.2, fill: COAT.base }, s);
  const pat = el("g", { "clip-path": `url(#${id}-sclip)` }, s);
  el("ellipse", { cx: -4.5, cy: -4, rx: 7, ry: 5.6, fill: COAT.orange }, pat);
  el("ellipse", { cx: 9.2, cy: 3.7, rx: 4.6, ry: 3.6, fill: COAT.muzzle }, s);
  el("ellipse", { cx: 7.6, cy: 6.6, rx: 3.2, ry: 2, fill: COAT.muzzle }, s);
  r.sMouthOpen = el("ellipse", { cx: 11.4, cy: 4.6, rx: 2.4, ry: 0.1, fill: "#5a2f36" }, s);
  r.sTongue = el("ellipse", { cx: 13.3, cy: 4.4, rx: 1.5, ry: 0.9, fill: "#e8838c", opacity: 0 }, s);
  r.sEarN = el("g", {}, s);
  el("path", { d: "M-7.4 -5.2 L-4.6 -17.6 L1.6 -7 Z", fill: COAT.base }, r.sEarN);
  el("path", { d: "M-5.8 -6.6 L-4.4 -14.6 L-0.4 -7.6 Z", fill: COAT.inner, opacity: 0.85 }, r.sEarN);
  r.sEye = el("g", {}, s);
  el("ellipse", { cx: 0, cy: 0, rx: 2.5, ry: 2.15, fill: COAT.eye }, r.sEye);
  r.sPupil = el("ellipse", { cx: 0.35, cy: 0, rx: 0.8, ry: 1.95, fill: "#111216" }, r.sEye);
  el("circle", { cx: 1.05, cy: -0.85, r: 0.55, fill: "#ffffff" }, r.sEye);
  r.sLid = el("path", { d: "M-2.7 -0.8 Q0 -2.9 2.7 -0.5", fill: "none", stroke: COAT.ink, "stroke-width": 0.7, "stroke-linecap": "round" }, s);
  el("path", { d: "M12.5 1 L14.4 1.1 L13.5 2.5 Z", fill: COAT.nose }, s);
  el("path", { d: "M13.5 2.5 q-0.4 1.3 -1.9 1.2", fill: "none", stroke: COAT.ink, "stroke-width": 0.5, "stroke-linecap": "round" }, s);
  el("path", { d: "M11.4 3.2 L22 1 M11.6 3.9 L22.4 4.3 M11.4 4.6 L21 7.6", fill: "none", stroke: COAT.whisker, "stroke-width": 0.35, "stroke-linecap": "round", opacity: 0.75 }, s);
  return s;
}

function frontHead(r: Partial<Rig>, parent: Element, id: string): SVGGElement {
  const f = el("g", { opacity: 0 }, parent);
  el("path", { d: "M-10.4 -3 L-9 -17.4 L-1.8 -8.4 Z", fill: COAT.orange }, f);
  el("path", { d: "M10.4 -3 L9 -17.4 L1.8 -8.4 Z", fill: COAT.black }, f);
  el("path", { d: "M-8.6 -5.2 L-8 -14.4 L-3.6 -8.6 Z", fill: COAT.inner, opacity: 0.85 }, f);
  el("path", { d: "M8.6 -5.2 L8 -14.4 L3.6 -8.6 Z", fill: COAT.inner, opacity: 0.85 }, f);
  el("ellipse", { cx: 0, cy: 0, rx: 11, ry: 9.4, fill: COAT.base }, f);
  el("ellipse", { cx: 0, cy: 3.2, rx: 12.2, ry: 7, fill: COAT.base }, f);
  const pat = el("g", { "clip-path": `url(#${id}-fclip)` }, f);
  el("ellipse", { cx: -7, cy: -3, rx: 6.6, ry: 7, fill: COAT.orange }, pat);
  el("ellipse", { cx: 7.6, cy: -5.4, rx: 5, ry: 4.6, fill: COAT.black }, pat);
  el("ellipse", { cx: -2.3, cy: 4.3, rx: 3.1, ry: 2.5, fill: COAT.muzzle }, f);
  el("ellipse", { cx: 2.3, cy: 4.3, rx: 3.1, ry: 2.5, fill: COAT.muzzle }, f);
  r.fEyes = [-4.3, 4.3].map((x) => {
    const g = el("g", {}, f);
    el("ellipse", { cx: 0, cy: 0, rx: 2.6, ry: 2.4, fill: COAT.eye }, g);
    const pupil = el("ellipse", { cx: 0, cy: 0, rx: 0.8, ry: 2.1, fill: "#111216" }, g);
    el("circle", { cx: 0.8, cy: -0.9, r: 0.6, fill: "#ffffff" }, g);
    return { g, pupil, x };
  });
  el("path", { d: "M-1.3 2.3 L1.3 2.3 L0 3.7 Z", fill: COAT.nose }, f);
  el("path", { d: "M0 3.7 V4.5 M-2.4 4.6 q1.2 1.3 2.4 0 q1.2 1.3 2.4 0", fill: "none", stroke: COAT.ink, "stroke-width": 0.55, "stroke-linecap": "round" }, f);
  el("path", { d: "M-4.4 4 L-16 2 M-4.4 4.8 L-16.4 5 M-4.4 5.6 L-15.4 7.8 M4.4 4 L16 2 M4.4 4.8 L16.4 5 M4.4 5.6 L15.4 7.8", fill: "none", stroke: COAT.whisker, "stroke-width": 0.35, "stroke-linecap": "round", opacity: 0.75 }, f);
  return f;
}

function defs(parent: Element, id: string): { fn: SVGFEFuncRElement[]; clip: SVGPathElement } {
  const d = el("defs", {}, parent);
  const grad = el("linearGradient", { id: `${id}-g`, x1: 0, y1: 0, x2: 0, y2: 1 }, d);
  el("stop", { offset: 0, "stop-color": COAT.top }, grad);
  el("stop", { offset: 0.5, "stop-color": COAT.base }, grad);
  el("stop", { offset: 1, "stop-color": COAT.light }, grad);
  // the light of the hour, and of lamp 07 after dark
  const filter = el("filter", { id: `${id}-lit`, x: -160, y: -140, width: 320, height: 190, filterUnits: "userSpaceOnUse", "color-interpolation-filters": "sRGB" }, d);
  const ct = el("feComponentTransfer", {}, filter);
  const fn = (["R", "G", "B"] as const).map((c) => el(`feFunc${c}`, { type: "linear", slope: 1, intercept: 0 }, ct) as SVGFEFuncRElement);
  const clip = el("path", {}, el("clipPath", { id: `${id}-clip` }, d));
  const sclip = el("clipPath", { id: `${id}-sclip` }, d);
  el("ellipse", { cx: 0, cy: 0, rx: 10, ry: 8.8 }, sclip);
  el("ellipse", { cx: 3, cy: 3.5, rx: 8, ry: 6.2 }, sclip);
  const fclip = el("clipPath", { id: `${id}-fclip` }, d);
  el("ellipse", { cx: 0, cy: 0, rx: 11, ry: 9.4 }, fclip);
  el("ellipse", { cx: 0, cy: 3.2, rx: 12.2, ry: 7 }, fclip);
  const glint = el("radialGradient", { id: `${id}-glint` }, d);
  el("stop", { offset: 0, "stop-color": "#fff6c6", "stop-opacity": 1 }, glint);
  el("stop", { offset: 0.35, "stop-color": "#f4dd7a", "stop-opacity": 0.75 }, glint);
  el("stop", { offset: 1, "stop-color": "#f4dd7a", "stop-opacity": 0 }, glint);
  return { fn, clip };
}

/** Builds the cat inside `parent`; `id` keeps gradient and clip ids unique. */
export function buildRig(parent: Element, id: string): Rig {
  const r: Partial<Rig> = {};
  const { fn, clip } = defs(parent, id);
  r.fn = fn;
  r.clip = clip;
  r.place = el("g", {}, parent);
  r.shadow = el("ellipse", { cx: 0, cy: 0.6, rx: 27, ry: 3.2, fill: "#05070d" }, r.place);
  r.flip = el("g", {}, r.place);
  r.hit = el("g", { class: "cat-hit" }, r.flip);
  const lit = el("g", { filter: `url(#${id}-lit)` }, r.hit);
  r.tail = Array.from({ length: TAIL_N }, (_, i) => line(lit, lerp(5.6, 3.7, i / (TAIL_N - 1)), i < 4 ? COAT.black : i < 8 ? COAT.orange : COAT.base));
  r.farH = leg(lit, false, COAT.far);
  r.farF = leg(lit, true, COAT.far);
  r.body = el("path", { fill: `url(#${id}-g)` }, lit);
  const patches = el("g", { "clip-path": `url(#${id}-clip)` }, lit);
  r.patchA = el("ellipse", { rx: 13, ry: 7.5, fill: COAT.orange }, patches);
  r.patchB = el("ellipse", { rx: 8.5, ry: 6.5, fill: COAT.black }, patches);
  r.nearH = leg(lit, false, COAT.base);
  r.haunch = el("ellipse", { fill: COAT.base }, r.nearH.g);
  r.nearF = leg(lit, true, COAT.base);
  r.neck = line(lit, 12.5, COAT.base);
  r.head = el("g", {}, lit);
  r.side = sideHead(r, r.head, id);
  r.front = frontHead(r, r.head, id);
  // eye-shine in the dark: outside the dimming filter, following the head
  r.glintHead = el("g", {}, r.hit);
  r.glintSide = el("circle", { r: 3.2, fill: `url(#${id}-glint)`, opacity: 0 }, r.glintHead);
  r.glintFront = [-4.3, 4.3].map((x) => el("circle", { cx: x, cy: -1, r: 3.4, fill: `url(#${id}-glint)`, opacity: 0 }, r.glintHead));
  return r as Rig;
}

type Frame = { at: (o: Vec, along: number, up: number) => Vec; S: Vec; H: Vec; M: Vec; angle: number };

function frame(pose: Pose): Frame {
  const { S, H } = pose;
  const d = norm(sub(S, H));
  const n: Vec = [d[1], -d[0]];
  const at = (o: Vec, along: number, up: number) => add(add(o, mul(d, along)), mul(n, up));
  return { at, S, H, M: mul(add(S, H), 0.5), angle: deg(Math.atan2(d[1], d[0])) };
}

function drawBody(r: Rig, pose: Pose, f: Frame): void {
  const { at, S, H, M } = f;
  const br = pose.breathe;
  const outline = closedPath([
    at(S, 9, -1), at(S, 8, 6.5), at(S, 1, 10.5), at(M, 0, 9.5 + pose.arch),
    at(H, -1, 10.5), at(H, -10, 3.5), at(H, -8, -5.5 * br), at(H, 5, -6 - pose.belly * 0.4),
    at(M, 0, -9 * br - pose.belly), at(S, 1, -7 * br), at(S, 8, -5),
  ]);
  r.body.setAttribute("d", outline);
  r.clip.setAttribute("d", outline);
  const pa = at(M, 3, 7);
  const pb = at(H, -2, 5);
  set(r.patchA, { cx: f2(pa[0]), cy: f2(pa[1]), transform: `rotate(${f2(f.angle)} ${pt(pa)})` });
  set(r.patchB, { cx: f2(pb[0]), cy: f2(pb[1]), transform: `rotate(${f2(f.angle)} ${pt(pb)})` });
}

function drawTail(r: Rig, pose: Pose, f: Frame, t: number): void {
  let p = f.at(f.H, -8, 5.5);
  let angle = pose.tail.base;
  r.tail.forEach((seg, i) => {
    const k = i / (TAIL_N - 1);
    if (i > 0) angle += pose.tail.curl;
    const sway = pose.tail.sway * Math.sin(t * TAU * pose.tail.freq - i * 0.45) * (0.3 + 0.7 * k);
    const flick = pose.tail.flick * Math.max(0, (i - (TAIL_N - 5)) / 4);
    let next = add(p, mul(dirv(angle + sway - flick), TAIL_SEG));
    if (next[1] > -1.3) next = [next[0], -1.3]; // a resting tail lies on the ground
    set(seg, { x1: f2(p[0]), y1: f2(p[1]), x2: f2(next[0]), y2: f2(next[1]) });
    p = next;
  });
}

function hindLeg(parts: LegParts, hip: Vec, foot: Vec, thighAngle: number): Vec {
  const knee = add(hip, mul(dirv(thighAngle), BONE.thigh));
  const [hock, toe] = ik2(knee, foot, BONE.shin, BONE.meta, 1);
  if (parts.thigh) set(parts.thigh, { x1: f2(hip[0]), y1: f2(hip[1]), x2: f2(knee[0]), y2: f2(knee[1]) });
  set(parts.a, { x1: f2(knee[0]), y1: f2(knee[1]), x2: f2(hock[0]), y2: f2(hock[1]) });
  set(parts.b, { x1: f2(hock[0]), y1: f2(hock[1]), x2: f2(toe[0]), y2: f2(toe[1]) });
  const tilt = deg(Math.atan2(toe[1] - hock[1], toe[0] - hock[0])) - 90;
  set(parts.paw, { cx: f2(toe[0] + 1.2), cy: f2(toe[1] - 1.1), transform: `rotate(${f2(clamp(tilt * -0.4, -35, 35))} ${pt(toe)})` });
  return knee;
}

function foreLeg(parts: LegParts, shoulder: Vec, foot: Vec, fold: number): void {
  const root = add(shoulder, [1, 3]);
  const [wrist, toe] = ik2(root, foot, BONE.foreA, BONE.foreB, lerp(1, -1, fold));
  set(parts.a, { x1: f2(root[0]), y1: f2(root[1]), x2: f2(wrist[0]), y2: f2(wrist[1]) });
  set(parts.b, { x1: f2(wrist[0]), y1: f2(wrist[1]), x2: f2(toe[0]), y2: f2(toe[1]) });
  const tilt = deg(Math.atan2(toe[1] - wrist[1], toe[0] - wrist[0])) - 90;
  set(parts.paw, { cx: f2(toe[0] + 1.3), cy: f2(toe[1] - 1.1), transform: `rotate(${f2(clamp(-tilt * 0.5, -50, 50))} ${pt(toe)})` });
}

function drawLegs(r: Rig, pose: Pose, f: Frame): void {
  const far: Vec = [1.5, -1.2];
  hindLeg(r.farH, add(f.H, far), pose.feet.rh, pose.thigh.rh);
  foreLeg(r.farF, add(f.S, far), pose.feet.rf, pose.bend.rf);
  const knee = hindLeg(r.nearH, f.H, pose.feet.lh, pose.thigh.lh);
  foreLeg(r.nearF, f.S, pose.feet.lf, pose.bend.lf);
  // the near thigh shows as a rounded haunch, bigger when sitting
  const c = add(mul(add(f.H, knee), 0.5), [-0.5, 0.5]);
  set(r.haunch, {
    cx: f2(c[0]),
    cy: f2(c[1]),
    rx: f2(lerp(9.5, 12.5, pose.haunch)),
    ry: f2(lerp(7.4, 9.6, pose.haunch)),
    transform: `rotate(${f2(deg(pose.thigh.lh))} ${pt(c)})`,
  });
  for (const g of [r.farF.g, r.farH.g]) g.setAttribute("opacity", f2(1 - pose.tuck));
}

function drawHead(r: Rig, pose: Pose, f: Frame, sim: Sim, light: Light, flipMag: number): void {
  const turn = clamp(pose.turn, 0, 1);
  const centre = add(add(f.S, pose.head), [-3 * turn, 1.5 * turn]);
  const neckBase = f.at(f.S, 3, 5);
  set(r.neck, { x1: f2(neckBase[0]), y1: f2(neckBase[1]), x2: f2(centre[0] - 3), y2: f2(centre[1] + 2.5) });
  // the head stays round while the body narrows in a turn
  const transform = `translate(${pt(centre)}) rotate(${f2(deg(pose.hAng))}) scale(${f2(1.1 / flipMag)} 1.1)`;
  r.head.setAttribute("transform", transform);
  r.glintHead.setAttribute("transform", transform);
  const profile = 1 - smooth(clamp((turn - 0.25) / 0.5, 0, 1));
  set(r.side, { opacity: f2(profile), transform: `scale(${f2(1 - 0.35 * turn)} 1)` });
  set(r.front, { opacity: f2(1 - profile), transform: `translate(${f2(2.5 * (1 - turn))} 0) scale(${f2(0.75 + 0.25 * turn)} 1)` });
  r.sEarN.setAttribute("transform", `rotate(${f2(deg(pose.earN + sim.earTwitch))} -3 -6)`);
  r.sEarF.setAttribute("transform", `rotate(${f2(deg(pose.earF))} 2 -6)`);
  // eyes: blinks, and pupils that widen in the dark or on the hunt
  const open = clamp(Math.min(pose.eye, sim.blink), 0.06, 1);
  const pupil = clamp(light.pupil + pose.excite * 0.6, 0, 1);
  r.sEye.setAttribute("transform", `translate(5 -1.4) scale(1 ${f2(open)})`);
  r.sPupil.setAttribute("rx", f2(lerp(0.55, 1.75, pupil)));
  r.sLid.setAttribute("transform", `translate(5 ${f2(-1.4 + (1 - open) * 1.6)})`);
  for (const e of r.fEyes) {
    e.g.setAttribute("transform", `translate(${e.x} -1) scale(1 ${f2(open)})`);
    e.pupil.setAttribute("rx", f2(lerp(0.6, 1.9, pupil)));
  }
  r.sMouthOpen.setAttribute("ry", f2(0.1 + 2.6 * pose.mouth));
  set(r.sTongue, { opacity: f2(Math.max(pose.tongue, pose.mouth * 0.9)), cy: f2(4.4 + 1.6 * pose.mouth) });
  const shine = light.glow * open;
  set(r.glintSide, { opacity: f2(shine * 0.55 * profile), transform: `translate(5 -1.4) scale(${f2(1 - 0.35 * turn)} 1)` });
  for (const g of r.glintFront) g.setAttribute("opacity", f2(shine * (1 - profile)));
}

/** Moves the rig to `pose`, standing at (x, y) in street units. */
export function drawRig(r: Rig, pose: Pose, sim: Sim, light: Light, x: number, y: number): void {
  const facing = Math.sign(sim.flip || 1);
  const flipMag = Math.max(0.32, Math.abs(sim.flip));
  r.place.setAttribute("transform", `translate(${f2(x)} ${f2(y)}) scale(${f2(sim.scale)})`);
  r.flip.setAttribute("transform", `translate(${f2(pose.rootX * facing)} ${f2(pose.rootY)}) scale(${f2(facing * flipMag)} 1)`);
  const airborne = Math.min(0.6, -pose.rootY / 50);
  set(r.shadow, { cx: f2(pose.rootX * facing), rx: f2(27 * (1 - Math.min(0.5, -pose.rootY / 60))), opacity: f2(light.shadow * (1 - airborne)) });
  r.fn.forEach((fn, i) => fn.setAttribute("slope", f2([light.r, light.g, light.b][i] as number)));
  const f = frame(pose);
  drawBody(r, pose, f);
  drawTail(r, pose, f, sim.t);
  drawLegs(r, pose, f);
  drawHead(r, pose, f, sim, light, flipMag);
}

export interface BugShape {
  g: SVGGElement;
  wings: SVGEllipseElement[];
}

export function buildBug(parent: Element): BugShape {
  const g = el("g", { opacity: 0 }, parent);
  const wings = [-2.2, 2.2].map((cx) => el("ellipse", { cx, cy: -1, rx: 2.6, ry: 1.7 }, g));
  el("ellipse", { cx: 0, cy: 0, rx: 0.6, ry: 2, fill: "#3a3330" }, g);
  return { g, wings };
}

/** A butterfly by day, a pale moth at night; wings beat fast. */
export function drawBug(shape: BugShape, sim: Sim, time: string, groundY: number): void {
  const bug = sim.bug;
  if (!bug) {
    shape.g.setAttribute("opacity", "0");
    return;
  }
  const color = time === "night" ? "#efe6cf" : time === "dusk" ? "#f6c977" : "#fbe58a";
  const beat = 0.35 + 0.65 * Math.abs(Math.sin(sim.t * 22));
  set(shape.g, { opacity: f2(bug.alpha), transform: `translate(${f2(bug.x)} ${f2(groundY + bug.y)}) scale(${f2(sim.scale * 0.9)})` });
  for (const w of shape.wings) set(w, { fill: color, transform: `scale(${f2(beat)} 1)` });
}
