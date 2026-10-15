/**
 * Koi pond for the home stage, seen from above: WebGL water with ripples,
 * caustics and dappled light over a 2D pond floor, koi that swim, glide and
 * come up for food, lily pads and lotus. Tap the water to scatter food;
 * drag to stir it. Adapted from the owner's "錦鯉池" prototype; the drawing
 * and swimming are unchanged, the page plumbing is new:
 *
 * - it fills `host` (an absolutely positioned box in the stage), not the
 *   window, and reads pointers relative to it;
 * - it pauses while the tab is hidden and releases the GPU on destroy();
 * - with reduced motion the fish and water stay still; only ripples the
 *   visitor makes themselves move;
 * - no fonts or other network requests.
 *
 * Plain .mjs (typed by koiPond.d.mts): the engine is the prototype's
 * canvas/WebGL code, kept close to the original rather than retyped.
 */
const TAU = Math.PI * 2, R = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const KOI_KINDS = ['kohaku', 'showa', 'ogon', 'platinum'];

export function mountKoiPond(host, options = {}) {
const reduce = !!options.reducedMotion;
const onCount = typeof options.onCount === 'function' ? options.onCount : () => {};
// night: the moon's reflection fades in on the water and rides its ripples
let moonT = options.night ? 1 : 0, moonA = moonT;
const waterCv = document.createElement('canvas'), surf = document.createElement('canvas');
waterCv.className = 'koi-water'; surf.className = 'koi-surface';
waterCv.setAttribute('aria-hidden', 'true'); surf.setAttribute('aria-hidden', 'true');
host.append(waterCv, surf);
const sctx = surf.getContext('2d');
let W, H, DPR, SD, B, P;           // css size, display dpr, scene dpr, rim width, pond rect
let scene, sg, floorC, stonesC, shC; const SHF = .16;    // underwater scene canvas, static layers
let gw, gh, h0, h1, hmask;         // ripple height field
const CELL = 4;
const fish = [], foods = [], pads = [], leaves = [];
let dapLight, dapPat, t0 = 0;

/* ================= noise helpers ================= */
function fbm(S, period, oct, gain = .5) {
  const out = new Float32Array(S * S); let amp = 1, tot = 0;
  for (let o = 0; o < oct; o++) {
    const p = period << o, lat = new Float32Array(p * p);
    for (let i = 0; i < lat.length; i++) lat[i] = Math.random();
    for (let y = 0; y < S; y++) {
      const fy = y / S * p, iy = fy | 0; let ty = fy - iy; ty = ty * ty * (3 - 2 * ty);
      const r0 = (iy % p) * p, r1 = ((iy + 1) % p) * p;
      for (let x = 0; x < S; x++) {
        const fx = x / S * p, ix = fx | 0; let tx = fx - ix; tx = tx * tx * (3 - 2 * tx);
        const x0 = ix % p, x1 = (ix + 1) % p;
        const a = lat[r0 + x0] + (lat[r0 + x1] - lat[r0 + x0]) * tx;
        const b = lat[r1 + x0] + (lat[r1 + x1] - lat[r1 + x0]) * tx;
        out[y * S + x] += (a + (b - a) * ty) * amp;
      }
    }
    tot += amp; amp *= gain;
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}
function causticData() {
  const S = 256, d = new Uint8Array(S * S), pts = [];
  for (let i = 0; i < 26; i++) pts.push([Math.random() * S, Math.random() * S]);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let f1 = 1e9, f2 = 1e9;
    for (const p of pts) for (let ox = -S; ox <= S; ox += S) for (let oy = -S; oy <= S; oy += S) {
      const dx = x - p[0] - ox, dy = y - p[1] - oy, q = dx * dx + dy * dy;
      if (q < f1) { f2 = f1; f1 = q; } else if (q < f2) f2 = q;
    }
    const v = Math.max(0, 1 - (Math.sqrt(f2) - Math.sqrt(f1)) / 7);
    d[y * S + x] = v * v * 255;
  }
  return d;
}
function grayCanvas(S, data, map) {
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), img = g.createImageData(S, S);
  for (let i = 0; i < S * S; i++) { const [r, gg, b, a] = map(data[i]); img.data.set([r, gg, b, a], i * 4); }
  g.putImageData(img, 0, 0); return c;
}
const N256a = fbm(256, 4, 5), N256b = fbm(256, 16, 3), DAP = fbm(256, 3, 4, .55);
const stoneTex = grayCanvas(256, N256b, v => { const s = Math.random() < .08 ? (Math.random() < .5 ? -60 : 50) : 0; const l = clamp(110 + (v - .5) * 260 + s, 0, 255); return [l, l, l, 255]; });
const mudTex = grayCanvas(256, N256a, v => { const l = clamp(150 + (v - .5) * 220, 0, 255); return [l, l * .97, l * .9, 255]; });
const padTex = grayCanvas(256, N256b, v => { const l = clamp(185 + (v - .5) * 160, 0, 255); return [l, l, l * .92, 255]; });
const DAP_S = 256; dapLight = new Uint8Array(DAP_S * DAP_S);
for (let i = 0; i < dapLight.length; i++) { let v = (DAP[i] - .43) / .16; v = clamp(v, 0, 1); v = v * v * (3 - 2 * v); dapLight[i] = v * 255; }
const dapCanvas = grayCanvas(DAP_S, dapLight, v => [6, 18, 14, (1 - v / 255) * 255 * .38]);

/* ================= geometry helpers ================= */
function mk(w, h, d) { const c = document.createElement('canvas'); c.width = Math.ceil(w * d); c.height = Math.ceil(h * d); const g = c.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0); c.g = g; return c; }
function rrPath(g, x, y, w, h, r) { g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function sd(px, py) {
  const cx = P.x + P.w / 2, cy = P.y + P.h / 2, r = P.r;
  const qx = Math.abs(px - cx) - (P.w / 2 - r), qy = Math.abs(py - cy) - (P.h / 2 - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}
function smooth(path, pts) {
  const n = pts.length;
  path.moveTo((pts[n - 1][0] + pts[0][0]) / 2, (pts[n - 1][1] + pts[0][1]) / 2);
  for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; path.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2); }
  path.closePath();
}
function noisyBlob(rx, ry, k, jit) { const pts = []; const ph = R(0, TAU); for (let i = 0; i < k; i++) { const a = i / k * TAU, m = 1 + Math.sin(a * 2 + ph) * jit * .5 + R(-jit, jit) * .5; pts.push([Math.cos(a) * rx * m, Math.sin(a) * ry * m]); } const p = new Path2D(); smooth(p, pts); return p; }

/* ================= ripple height field ================= */
function initField() {
  gw = Math.ceil(W / CELL) + 2; gh = Math.ceil(H / CELL) + 2;
  h0 = new Float32Array(gw * gh); h1 = new Float32Array(gw * gh); hmask = new Uint8Array(gw * gh);
  for (let y = 1; y < gh - 1; y++) for (let x = 1; x < gw - 1; x++) hmask[y * gw + x] = sd(x * CELL, y * CELL) < 0 ? 1 : 0;
}
function step() {
  for (let y = 1; y < gh - 1; y++) for (let x = 1, i = y * gw + 1; x < gw - 1; x++, i++) {
    if (!hmask[i]) { h1[i] = 0; continue; }
    h1[i] = ((h0[i - 1] + h0[i + 1] + h0[i - gw] + h0[i + gw]) * .5 - h1[i]) * .984;
  }
  const t = h0; h0 = h1; h1 = t;
}
function drop(x, y, rad, str) {
  const cx = x / CELL, cy = y / CELL, rc = Math.max(1.2, rad / CELL);
  for (let yy = Math.max(1, Math.floor(cy - rc)); yy <= Math.min(gh - 2, Math.ceil(cy + rc)); yy++)
    for (let xx = Math.max(1, Math.floor(cx - rc)); xx <= Math.min(gw - 2, Math.ceil(cx + rc)); xx++) {
      const d = Math.hypot(xx - cx, yy - cy); if (d > rc) continue;
      h0[yy * gw + xx] += str * .5 * (Math.cos(Math.PI * d / rc) + 1);
    }
}
function fieldGrad(x, y) {
  const ix = clamp(Math.round(x / CELL), 1, gw - 2), iy = clamp(Math.round(y / CELL), 1, gh - 2), i = iy * gw + ix;
  return [h0[i + 1] - h0[i - 1], h0[i + gw] - h0[i - gw]];
}

/* ================= static: pond floor ================= */
function buildFloor() {
  floorC = mk(W, H, SD); const g = floorC.g;
  g.fillStyle = '#3a342b'; g.fillRect(0, 0, W, H);
  g.save(); g.beginPath(); rrPath(g, P.x, P.y, P.w, P.h, P.r); g.clip();
  g.fillStyle = '#8c8574'; g.fillRect(P.x, P.y, P.w, P.h);
  const mp = g.createPattern(mudTex, 'repeat'); mp.setTransform(new DOMMatrix().scale(2.2));
  g.globalCompositeOperation = 'multiply'; g.fillStyle = mp; g.fillRect(P.x, P.y, P.w, P.h);
  g.globalCompositeOperation = 'source-over';
  // gravel
  const n = Math.min(11000, P.w * P.h / 75);
  for (let i = 0; i < n; i++) {
    const x = R(P.x, P.x + P.w), y = R(P.y, P.y + P.h), r = Math.pow(Math.random(), 2.2) * 5.5 + 1.2, rot = R(0, TAU), ry = r * R(.6, .95);
    const h = R(20, 48), s = R(4, 18), l = R(36, 66);
    g.fillStyle = 'rgba(25,20,12,.32)'; g.beginPath(); g.ellipse(x + r * .35, y + r * .45, r, ry, rot, 0, TAU); g.fill();
    g.fillStyle = `hsl(${h},${s}%,${l}%)`; g.beginPath(); g.ellipse(x, y, r, ry, rot, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,250,235,.13)'; g.beginPath(); g.ellipse(x - r * .3, y - r * .3, r * .45, ry * .4, rot, 0, TAU); g.fill();
  }
  // a few larger river stones on the bottom
  for (let i = 0; i < Math.round(P.w * P.h / 45000); i++) {
    const x = R(P.x, P.x + P.w), y = R(P.y, P.y + P.h), r = R(9, 22), h = R(25, 45), l = R(40, 62);
    g.save(); g.translate(x, y); g.rotate(R(0, TAU));
    const p = noisyBlob(r, r * R(.65, .9), 10, .15);
    g.shadowColor = 'rgba(20,15,8,.5)'; g.shadowBlur = r * .5 * SD; g.shadowOffsetX = r * .2 * SD; g.shadowOffsetY = r * .3 * SD;
    const gr = g.createRadialGradient(-r * .35, -r * .35, 0, 0, 0, r * 1.1);
    gr.addColorStop(0, `hsl(${h},10%,${l + 16}%)`); gr.addColorStop(1, `hsl(${h},12%,${l - 12}%)`);
    g.fillStyle = gr; g.fill(p); g.restore();
  }
  // sunken leaves
  for (let i = 0; i < Math.round(P.w * P.h / 70000) + 3; i++) {
    const x = R(P.x + 20, P.x + P.w - 20), y = R(P.y + 20, P.y + P.h - 20), L = R(14, 26);
    g.save(); g.translate(x, y); g.rotate(R(0, TAU)); g.globalAlpha = R(.55, .85);
    g.fillStyle = ['#6e4f22', '#85602a', '#5a4a24', '#7a5527'][i % 4];
    g.beginPath(); g.moveTo(-L / 2, 0); g.quadraticCurveTo(0, -L * .32, L / 2, 0); g.quadraticCurveTo(0, L * .32, -L / 2, 0); g.fill();
    g.strokeStyle = 'rgba(40,25,8,.5)'; g.lineWidth = .7; g.beginPath(); g.moveTo(-L / 2 - 3, 0); g.lineTo(L / 2, 0); g.stroke(); g.restore();
  }
  // algae & sediment
  for (let i = 0; i < 22; i++) {
    const x = R(P.x, P.x + P.w), y = R(P.y, P.y + P.h), r = R(50, 180), a = g.createRadialGradient(x, y, 0, x, y, r);
    const c = Math.random() < .6 ? '58,78,36' : '70,58,40';
    a.addColorStop(0, `rgba(${c},.28)`); a.addColorStop(1, `rgba(${c},0)`);
    g.fillStyle = a; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // water colour: absorption deepens toward the middle and darkens near the walls
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = '#6fa9a0'; g.fillRect(P.x, P.y, P.w, P.h);
  const cx = P.x + P.w / 2, cy = P.y + P.h / 2, dg = g.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(P.w, P.h) * .55);
  dg.addColorStop(0, '#9fc7c2'); dg.addColorStop(.6, '#d9ebe6'); dg.addColorStop(1, '#ffffff');
  g.fillStyle = dg; g.fillRect(P.x, P.y, P.w, P.h);
  g.globalCompositeOperation = 'source-over';
  g.fillStyle = 'rgba(22,80,78,.16)'; g.fillRect(P.x, P.y, P.w, P.h);
  // wall shadow
  g.shadowColor = 'rgba(4,22,22,.85)'; g.shadowBlur = B * .8 * SD;
  g.beginPath(); g.rect(-W, -H, W * 3, H * 3); rrPath(g, P.x, P.y, P.w, P.h, P.r);
  g.fillStyle = '#000'; g.fill('evenodd');
  g.restore();
}

/* ================= static: stone rim ================= */
function buildStones() {
  stonesC = mk(W, H, DPR); const g = stonesC.g, st = [];
  g.beginPath(); g.rect(0, 0, W, H); rrPath(g, P.x + 6, P.y + 6, P.w - 12, P.h - 12, P.r);
  g.fillStyle = '#2c2721'; g.fill('evenodd');
  // moss and soil in the gaps
  for (let i = 0; i < (W + H) * 6; i++) {
    const x = R(0, W), y = R(0, H), d = sd(x, y); if (d < 2 || d > B * 1.3) continue;
    g.fillStyle = Math.random() < .55 ? `hsla(${R(70, 105)},${R(25, 45)}%,${R(18, 34)}%,${R(.4, .8)})` : `hsla(30,15%,${R(14, 24)}%,.7)`;
    g.beginPath(); g.arc(x, y, R(.8, 2.4), 0, TAU); g.fill();
  }
  const place = (a, b, tries) => {
    for (let t = 0; t < tries; t++) {
      const x = R(-B * .3, W + B * .3), y = R(-B * .3, H + B * .3), r = R(a, b), d = sd(x, y);
      if (d < -r * .3 || x < -r || y < -r || x > W + r || y > H + r) continue;
      let ok = true; for (const s of st) if (Math.hypot(s.x - x, s.y - y) < (s.r + r) * .82) { ok = false; break; }
      if (ok) st.push({ x, y, r, d });
    }
  };
  place(B * .32, B * .56, 2200); place(B * .18, B * .32, 2600); place(B * .09, B * .18, 2600);
  const sp = g.createPattern(stoneTex, 'repeat');
  for (const s of st) {
    const h = R(22, 48), sa = R(3, 14), l = R(38, 66), rx = s.r * R(.95, 1.15), ry = s.r * R(.72, .95), wet = s.d < s.r * .5;
    g.save(); g.translate(s.x, s.y); g.rotate(R(0, TAU));
    const path = noisyBlob(rx, ry, 11, .14);
    g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = s.r * .45 * DPR; g.shadowOffsetX = s.r * .12 * DPR; g.shadowOffsetY = s.r * .2 * DPR;
    g.fillStyle = `hsl(${h},${sa}%,${l - 14}%)`; g.fill(path); g.shadowColor = 'transparent';
    g.save(); g.clip(path);
    const gr = g.createRadialGradient(-rx * .3, -ry * .38, s.r * .05, 0, 0, s.r * 1.15);
    gr.addColorStop(0, `hsl(${h},${sa}%,${Math.min(88, l + 15)}%)`); gr.addColorStop(.55, `hsl(${h},${sa}%,${l}%)`); gr.addColorStop(1, `hsl(${h},${sa + 2}%,${l - 20}%)`);
    g.fillStyle = gr; g.fill(path);
    sp.setTransform(new DOMMatrix().translate(R(0, 256), R(0, 256)).scale(R(.25, .5)));
    g.globalCompositeOperation = 'overlay'; g.globalAlpha = .55; g.fillStyle = sp; g.fillRect(-rx * 1.2, -ry * 1.2, rx * 2.4, ry * 2.4);
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    if (Math.random() < .35) { // lichen
      for (let i = 0; i < s.r * .8; i++) { g.fillStyle = `hsla(${R(60, 90)},${R(15, 35)}%,${R(45, 65)}%,${R(.15, .35)})`; g.beginPath(); g.arc(R(-rx, rx) * .7, R(-ry, ry) * .7, R(.6, 2), 0, TAU); g.fill(); }
    }
    if (wet) { g.globalCompositeOperation = 'multiply'; g.fillStyle = 'rgba(80,90,85,.55)'; g.fillRect(-rx * 1.2, -ry * 1.2, rx * 2.4, ry * 2.4); g.globalCompositeOperation = 'source-over';
      g.fillStyle = 'rgba(255,255,255,.25)'; g.beginPath(); g.ellipse(-rx * .3, -ry * .4, rx * .28, ry * .12, -.4, 0, TAU); g.fill(); }
    // edge occlusion
    g.strokeStyle = 'rgba(15,10,5,.12)'; for (const lw of [.12, .24, .4]) { g.lineWidth = s.r * lw; g.stroke(path); }
    g.restore(); g.restore();
  }
}

/* ================= lily pads, lotus, floating leaves ================= */
const PAD_LAYOUT = [
  { fx: .05, fy: .42, s: .085 }, { fx: .12, fy: .52, s: .045 }, { fx: .6, fy: .1, s: .07, lotus: 1 }, { fx: .73, fy: .09, s: .062, lotus: 1 },
  { fx: .86, fy: .12, s: .078, lotus: 1 }, { fx: .8, fy: .2, s: .04, bud: 1 }, { fx: .92, fy: .36, s: .058 }, { fx: .93, fy: .85, s: .075 }, { fx: .83, fy: .9, s: .042 }, { fx: .05, fy: .9, s: .05 }
];
function padSprite(r, lotus, bud) {
  const m = r * 1.2, c = mk(m * 2, m * 2, DPR), g = c.g; g.translate(m, m);
  const notch = R(0, TAU), pts = [];
  for (let i = 0; i <= 40; i++) { const a = notch + .16 + i / 40 * (TAU - .32); const rr = r * (1 + Math.sin(a * 5 + notch) * .015 + R(-.012, .012)); pts.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
  const path = new Path2D(); path.moveTo(Math.cos(notch) * r * .05, Math.sin(notch) * r * .05); for (const p of pts) path.lineTo(p[0], p[1]); path.closePath();
  const hue = R(88, 105), gr = g.createRadialGradient(-r * .15, -r * .2, 0, 0, 0, r);
  gr.addColorStop(0, `hsl(${hue},38%,40%)`); gr.addColorStop(.7, `hsl(${hue + 4},45%,28%)`); gr.addColorStop(1, `hsl(${hue + 6},40%,22%)`);
  g.fillStyle = gr; g.fill(path);
  g.save(); g.clip(path);
  const pp = g.createPattern(padTex, 'repeat'); pp.setTransform(new DOMMatrix().translate(R(0, 256), R(0, 256)).scale(.35));
  g.globalCompositeOperation = 'multiply'; g.fillStyle = pp; g.fillRect(-r, -r, r * 2, r * 2); g.globalCompositeOperation = 'source-over';
  if (Math.random() < .5) { const yg = g.createRadialGradient(0, 0, r * .6, 0, 0, r); yg.addColorStop(0, 'rgba(160,130,40,0)'); yg.addColorStop(1, 'rgba(170,135,45,.45)'); g.fillStyle = yg; g.fillRect(-r, -r, r * 2, r * 2); }
  g.strokeStyle = 'rgba(190,220,140,.16)'; g.lineWidth = Math.max(.6, r * .012);
  for (let k = 0; k < 17; k++) { const a = notch + .25 + k / 16 * (TAU - .5); g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(Math.cos(a + .05) * r * .5, Math.sin(a + .05) * r * .5, Math.cos(a) * r, Math.sin(a) * r); g.stroke(); }
  const sh = g.createRadialGradient(-r * .4, -r * .45, 0, -r * .4, -r * .45, r * .9);
  sh.addColorStop(0, 'rgba(255,255,235,.2)'); sh.addColorStop(1, 'rgba(255,255,235,0)'); g.fillStyle = sh; g.fillRect(-r, -r, r * 2, r * 2);
  g.restore();
  g.lineWidth = Math.max(1, r * .03); g.strokeStyle = 'rgba(205,230,150,.32)'; g.stroke(path);
  for (let i = 0; i < 3 + (Math.random() * 4 | 0); i++) { // water beads
    const a = R(0, TAU), d = R(.15, .75) * r, x = Math.cos(a) * d, y = Math.sin(a) * d, rr = R(.8, 2.4);
    g.fillStyle = 'rgba(10,30,10,.35)'; g.beginPath(); g.arc(x + rr * .4, y + rr * .5, rr, 0, TAU); g.fill();
    g.fillStyle = 'rgba(200,230,200,.55)'; g.beginPath(); g.arc(x, y, rr, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,255,255,.95)'; g.beginPath(); g.arc(x - rr * .35, y - rr * .35, rr * .35, 0, TAU); g.fill();
  }
  if (lotus || bud) {
    const lx = R(-.12, .12) * r, ly = R(-.12, .12) * r;
    const petal = (len, wid, a, c0, c1, lift) => {
      g.save(); g.translate(lx, ly); g.rotate(a);
      const pg = g.createLinearGradient(0, 0, len, 0); pg.addColorStop(0, c0); pg.addColorStop(.55, c0); pg.addColorStop(1, c1);
      const p = new Path2D(); p.moveTo(0, 0); p.bezierCurveTo(len * .3, -wid * 1.1, len * .85, -wid * .7, len, 0); p.bezierCurveTo(len * .85, wid * .7, len * .3, wid * 1.1, 0, 0);
      g.shadowColor = `rgba(40,20,30,${.25 + lift * .2})`; g.shadowBlur = wid * .8 * DPR; g.shadowOffsetX = wid * .25 * lift * DPR; g.shadowOffsetY = wid * .35 * lift * DPR;
      g.fillStyle = pg; g.fill(p); g.shadowColor = 'transparent';
      g.strokeStyle = 'rgba(200,90,130,.18)'; g.lineWidth = .5;
      for (let v = -2; v <= 2; v++) { g.beginPath(); g.moveTo(len * .05, 0); g.quadraticCurveTo(len * .5, v * wid * .35, len * .95, v * wid * .08); g.stroke(); }
      g.restore();
    };
    if (bud) {
      for (let i = 0; i < 4; i++) petal(r * .55, r * .22, -Math.PI / 2 + R(-.25, .25) + (i - 1.5) * .18, '#f6dfe4', '#d65a86', 1);
    } else {
      const base = R(0, TAU);
      for (let i = 0; i < 10; i++) petal(r * .66, r * .2, base + i / 10 * TAU, '#f5e9e6', '#e07a9a', .6);
      for (let i = 0; i < 8; i++) petal(r * .5, r * .17, base + .3 + i / 8 * TAU, '#fbf2f1', '#ea93b0', 1);
      for (let i = 0; i < 6; i++) petal(r * .32, r * .13, base + .1 + i / 6 * TAU, '#fff8f7', '#f0aac2', 1.2);
      const cg = g.createRadialGradient(lx - r * .03, ly - r * .03, 0, lx, ly, r * .13); cg.addColorStop(0, '#f6e08a'); cg.addColorStop(1, '#c7a43a');
      g.fillStyle = cg; g.beginPath(); g.arc(lx, ly, r * .12, 0, TAU); g.fill();
      g.fillStyle = 'rgba(120,95,20,.75)'; for (let i = 0; i < 9; i++) { const a = i / 9 * TAU; g.beginPath(); g.arc(lx + Math.cos(a) * r * .065, ly + Math.sin(a) * r * .065, r * .013, 0, TAU); g.fill(); }
      g.strokeStyle = 'rgba(240,210,110,.8)'; g.lineWidth = .7;
      for (let i = 0; i < 24; i++) { const a = R(0, TAU); g.beginPath(); g.moveTo(lx + Math.cos(a) * r * .12, ly + Math.sin(a) * r * .12); g.lineTo(lx + Math.cos(a) * r * .19, ly + Math.sin(a) * r * .19); g.stroke(); }
    }
  }
  c.m = m; return c;
}
function leafSprite(L) {
  const c = mk(L * 1.2, L * 1.2, DPR), g = c.g; g.translate(L * .6, L * .6);
  const col = ['#a26a26', '#8d5a22', '#b8862f', '#6f5a2a'][Math.random() * 4 | 0];
  g.fillStyle = col; g.beginPath(); g.moveTo(-L * .45, 0); g.bezierCurveTo(-L * .2, -L * .28, L * .25, -L * .25, L * .45, 0); g.bezierCurveTo(L * .25, L * .25, -L * .2, L * .28, -L * .45, 0); g.fill();
  g.strokeStyle = 'rgba(60,35,10,.55)'; g.lineWidth = .8; g.beginPath(); g.moveTo(-L * .55, 0); g.lineTo(L * .42, 0); g.stroke();
  g.lineWidth = .5; for (let i = -3; i <= 3; i++) { if (!i) continue; const x = i * L * .1; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + L * .1, (i > 0 ? 1 : -1) * L * .15); g.moveTo(x, 0); g.lineTo(x + L * .1, -(i > 0 ? 1 : -1) * L * .15); g.stroke(); }
  c.m = L * .6; return c;
}
function buildPads() {
  pads.length = 0; const S = Math.sqrt(P.w * P.h) * .8;
  for (const d of PAD_LAYOUT) { const r = clamp(d.s * S, 14, 75); pads.push({ bx: P.x + d.fx * P.w, by: P.y + d.fy * P.h, x: 0, y: 0, ox: 0, oy: 0, r, rot: R(0, TAU), ph: R(0, TAU), spr: padSprite(r, d.lotus, d.bud) }); }
  leaves.length = 0;
  for (let i = 0; i < 4; i++) { const L = R(18, 30); leaves.push({ x: R(P.x + 40, P.x + P.w - 40), y: R(P.y + 40, P.y + P.h - 40), vx: R(-.08, .08), vy: R(-.08, .08), rot: R(0, TAU), vr: R(-.002, .002), L, spr: leafSprite(L) }); }
}

/* ================= koi ================= */
const KINDS = {
  kohaku:   { name: '紅白',     roma: 'Kohaku',   base: '#f6f2ea', fin: [248, 244, 238], scale: .13 },
  showa:    { name: '昭和三色', roma: 'Showa',    base: '#f1ebe1', fin: [244, 240, 232], scale: .15, motoguro: 1 },
  ogon:     { name: '黃金',     roma: 'Ogon',     base: '#eaa42c', fin: [244, 194, 96], metal: [255, 238, 176], scale: .3 },
  platinum: { name: '白金',     roma: 'Platinum', base: '#e3e7e6', fin: [238, 242, 242], metal: [255, 255, 255], scale: .26 }
};
// head 0–.18 blunt and broad, shoulders .18–.45, tapering to a thick tail root
const prof = t => t < .18 ? .6 + .4 * Math.sin(t / .18 * Math.PI / 2)
  : t < .55 ? 1 - Math.pow((t - .18) / .37, 2) * .06
  : .94 - .57 * Math.pow((t - .55) / .45, 1.15);
const baseLen = () => clamp(Math.min(P.w, P.h) * .17, 48, 125);
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const SUN = [-.63, -.78];

function genPatches(kind) {
  const ps = [], patch = (t, s, rt, rs, c) => {
    const v = [], p1 = R(0, TAU), p2 = R(0, TAU), a1 = R(.12, .28), a2 = R(.07, .17);
    for (let i = 0; i < 20; i++) { const th = i / 20 * TAU; v.push(1 + a1 * Math.sin(2 * th + p1) + a2 * Math.sin(3 * th + p2) + R(-.06, .06)); }
    ps.push({ t, s, rt, rs, v, c });
  };
  const red = `hsl(${R(5, 11)},${R(70, 79)}%,${R(40, 46)}%)`;
  const steps = (from, to, n, rsMin, rsMax) => {
    const seg = (to - from) / n;
    for (let i = 0; i < n; i++) {
      const c = from + seg * (i + .5) + R(-.03, .03), s0 = R(-.45, .45);
      patch(c, s0, seg * R(.32, .5), R(rsMin, rsMax) * R(.55, .75), red);
      for (let j = 0; j < 1 + (Math.random() * 2 | 0); j++) patch(c + R(-.4, .4) * seg * .5, s0 + R(-.5, .5), seg * R(.15, .28), R(.5, .9), red);
    }
  };
  if (kind === 'kohaku') {
    if (Math.random() < .18) patch(.085, R(-.05, .05), .045, .6, red);          // tancho
    else {
      if (Math.random() < .8) patch(R(.065, .09), R(-.08, .08), R(.04, .055), R(.75, .95), red);
      steps(.2, R(.7, .84), 1 + (Math.random() * 3 | 0), 1.0, 1.7);
      if (Math.random() < .4) patch(R(.3, .6), R(.6, .9) * (Math.random() < .5 ? 1 : -1), .05, .5, red);
    }
  } else if (kind === 'showa') {
    patch(R(.065, .09), R(-.08, .08), R(.045, .06), R(.75, 1), red);
    steps(.22, .7, 2, .9, 1.4);
    const n = 3 + (Math.random() * 3 | 0);
    for (let i = 0; i < n; i++) { const side = Math.random() < .5 ? 1 : -1; patch(R(.14, .86), side * R(.3, 1), R(.05, .11), R(.8, 1.7), '#141111'); }
    if (Math.random() < .6) patch(R(.1, .14), R(-.3, .3), .035, .5, '#141111');
  }
  return ps;
}

class Koi {
  constructor(kind, x, y, a, L) {
    this.kind = kind; this.L = L || baseLen() * R(.7, 1.2); this.N = 16; this.seg = this.L / (this.N - 1); this.mw = this.L * .14;
    this.a = a; this.cruise = R(.55, .85) * (this.L / 85); this.v = this.cruise; this.phase = R(0, TAU); this.amp = .4;
    this.beating = false; this.beatT = R(0, 120); this.depth = R(.2, .85); this.dT = this.depth; this.born = 1; this.wk = 0;
    this.patches = genPatches(kind); this.tt = 0; this.target = null;
    this.pts = []; for (let i = 0; i < this.N; i++) this.pts.push({ x: x - Math.cos(a) * this.seg * i, y: y - Math.sin(a) * this.seg * i });
  }
  retarget() { const m = this.L * .9; this.target = { x: R(P.x + m, P.x + P.w - m), y: R(P.y + m, P.y + P.h - m) }; this.tt = R(300, 700); }
  update(k) {
    const h = this.pts[0], L = this.L; let tx, ty, eager = false, urgent = false;
    let best = null, bd = L * 5.5;
    for (const f of foods) { const d = Math.hypot(f.x - h.x, f.y - h.y); if (d < bd) { bd = d; best = f; } }
    if (best) {
      tx = best.x; ty = best.y; eager = true;
      if (bd < this.mw * 1.3 && this.depth < .2) { best.eaten = true; drop(best.x, best.y, this.mw * 1.6, 2.4); drop(best.x, best.y, this.mw * .6, -1.6); }
    } else {
      if (!this.target || Math.hypot(this.target.x - h.x, this.target.y - h.y) < L * .6 || (this.tt -= k) < 0) this.retarget();
      tx = this.target.x; ty = this.target.y;
    }
    let dx = tx - h.x, dy = ty - h.y, dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
    const ax = h.x + Math.cos(this.a) * L * .9, ay = h.y + Math.sin(this.a) * L * .9;
    if (sd(ax, ay) > -L * .35) { urgent = true; const cx = P.x + P.w / 2 - h.x, cy = P.y + P.h / 2 - h.y, cl = Math.hypot(cx, cy) || 1; dx += cx / cl * 2.2; dy += cy / cl * 2.2; }
    for (const o of fish) {
      if (o === this) continue; const q = o.pts[0], ox = h.x - q.x, oy = h.y - q.y, d = Math.hypot(ox, oy);
      if (d < L * .6 && d > 0 && Math.abs(o.depth - this.depth) < .35) { const w = (eager ? .25 : .7) * (1 - d / (L * .6)); dx += ox / d * w; dy += oy / d * w; }
    }
    let diff = Math.atan2(dy, dx) - this.a; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.a += clamp(diff, -1, 1) * (eager ? .07 : .035) * (urgent ? 1.6 : 1) * k;
    // burst-and-coast swimming
    if ((this.beatT -= k) < 0) { this.beating = !this.beating; this.beatT = this.beating ? R(40, 110) : R(90, 260); }
    const power = eager ? 1 : this.beating || urgent ? .75 : .25;
    this.amp += (power - this.amp) * .03 * k;
    const vt = this.cruise * (eager ? 2.2 : (.55 + this.amp * .8));
    this.v += (vt - this.v) * (vt > this.v ? .035 : .008) * k;
    this.phase += (.05 + this.amp * .13) * (85 / L) * k * 1.4;
    h.x += Math.cos(this.a) * this.v * k; h.y += Math.sin(this.a) * this.v * k;
    const e = sd(h.x, h.y); if (e > -this.mw) { const cx = P.x + P.w / 2 - h.x, cy = P.y + P.h / 2 - h.y, cl = Math.hypot(cx, cy) || 1; h.x += cx / cl * (e + this.mw); h.y += cy / cl * (e + this.mw); }
    for (let i = 1; i < this.N; i++) { const p = this.pts[i], q = this.pts[i - 1], ex = p.x - q.x, ey = p.y - q.y, l = Math.hypot(ex, ey) || 1; p.x = q.x + ex / l * this.seg; p.y = q.y + ey / l * this.seg; }
    // depth
    if (eager) this.dT = .02; else if (Math.random() < .002 * k) this.dT = Math.random() < .25 ? R(.05, .2) : R(.3, .9);
    this.depth += (this.dT - this.depth) * .006 * k;
    if (this.born < 1) this.born = Math.min(1, this.born + .015 * k);
    // surface wake
    if (this.depth < .22 && (this.wk += k) > 3) {
      this.wk = 0; const s = (.22 - this.depth) / .22;
      drop(h.x + Math.cos(this.a) * this.mw, h.y + Math.sin(this.a) * this.mw, this.mw * 1.3, s * this.v * .9);
      const tl = this.pts[this.N - 1]; drop(tl.x, tl.y, this.mw, s * this.amp * .6 * Math.sin(this.phase));
    }
  }
  geom() {
    const C = this.pts, N = this.N, mw = this.mw, L = this.L, X = [], Y = [], nx = [], ny = [], w = [];
    for (let i = 0; i < N; i++) {
      const a = C[Math.max(0, i - 1)], b = C[Math.min(N - 1, i + 1)]; let dx = a.x - b.x, dy = a.y - b.y; const l = Math.hypot(dx, dy) || 1;
      const s = i / (N - 1), off = mw * .7 * this.amp * Math.pow(s, 1.9) * Math.sin(this.phase - s * 5.2);
      X[i] = C[i].x - dy / l * off; Y[i] = C[i].y + dx / l * off;
    }
    for (let i = 0; i < N; i++) {
      const a = Math.max(0, i - 1), b = Math.min(N - 1, i + 1); let dx = X[a] - X[b], dy = Y[a] - Y[b]; const l = Math.hypot(dx, dy) || 1;
      nx[i] = -dy / l; ny[i] = dx / l; w[i] = mw * prof(i / (N - 1));
    }
    const sample = t => { const f = clamp(t, 0, 1) * (N - 1), i = Math.min(N - 2, f | 0), r = f - i;
      return [X[i] + (X[i + 1] - X[i]) * r, Y[i] + (Y[i + 1] - Y[i]) * r, nx[i] + (nx[i + 1] - nx[i]) * r, ny[i] + (ny[i + 1] - ny[i]) * r, w[i] + (w[i + 1] - w[i]) * r]; };
    const fx = ny[0], fy = -nx[0], pts = [];
    for (let i = 0; i < N; i++) pts.push([X[i] + nx[i] * w[i], Y[i] + ny[i] * w[i]]);
    pts.push([X[N - 1] + (X[N - 1] - X[N - 2]) * .35, Y[N - 1] + (Y[N - 1] - Y[N - 2]) * .35]);
    for (let i = N - 1; i >= 0; i--) pts.push([X[i] - nx[i] * w[i], Y[i] - ny[i] * w[i]]);
    for (const th of [-1.15, -.75, -.38, 0, .38, .75, 1.15]) pts.push([X[0] + nx[0] * w[0] * Math.sin(th) + fx * w[0] * .95 * Math.cos(th), Y[0] + ny[0] * w[0] * Math.sin(th) + fy * w[0] * .95 * Math.cos(th)]);
    const body = new Path2D(); smooth(body, pts);
    // tail: a flexing midline with two lobes
    const K = 6, sway = this.amp * .6 * Math.sin(this.phase - 6.0), base = Math.atan2(Y[N - 1] - Y[N - 2], X[N - 1] - X[N - 2]);
    const M = [[X[N - 1], Y[N - 1]]], A = [base];
    for (let k = 1; k <= K; k++) { const a = base + sway * Math.pow(k / K, 1.4); A.push(a); const p = M[k - 1]; M.push([p[0] + Math.cos(a) * L * .3 / K, p[1] + Math.sin(a) * L * .3 / K]); }
    const half = k => L * (.045 + .13 * Math.pow(k / K, 1.1)) * (1 + .12 * Math.sin(this.phase * .7 + k));
    const edge = (k, f) => [M[k][0] - Math.sin(A[k]) * half(k) * f, M[k][1] + Math.cos(A[k]) * half(k) * f];
    const tp = [M[0]]; for (let k = 1; k <= K; k++) tp.push(edge(k, 1));
    tp.push(edge(K, .55)); tp.push([M[4][0] + Math.cos(A[4]) * L * .02, M[4][1] + Math.sin(A[4]) * L * .02]); tp.push(edge(K, -.55));
    for (let k = K; k >= 1; k--) tp.push(edge(k, -1));
    const tail = new Path2D(); smooth(tail, tp);
    this.G = { X, Y, nx, ny, w, sample, body, tail, M, A, edge, fx, fy };
  }
  shadow(g) { // drawn into a low-resolution buffer, which softens it when scaled up
    const G = this.G, L = this.L, hgt = 1 - this.depth, d = L * (.05 + hgt * .3);
    g.save(); g.globalAlpha = this.born * (.55 - hgt * .25); g.translate(d * .6, d * .85);
    g.fillStyle = 'rgb(6,26,24)'; g.fill(G.body); g.globalAlpha *= .35; g.fill(G.tail); g.restore();
  }
  // soft band: several strokes of growing width stand in for a blur
  bands(g, path, color, widths, dx, dy) {
    g.save(); g.translate(dx, dy); g.strokeStyle = color; g.lineCap = 'round'; g.lineJoin = 'round';
    for (const w of widths) { g.lineWidth = w; g.stroke(path); } g.restore();
  }
  render(g, icon) {
    const G = this.G, K = KINDS[this.kind], N = this.N, L = this.L, mw = this.mw, dep = icon ? 0 : this.depth;
    const sc = icon ? 1 : SD, fa = 1 - dep * .3;
    g.save(); g.globalAlpha = this.born;
    /* ---- caudal fin ---- */
    const tr = g.createRadialGradient(G.M[0][0], G.M[0][1], 0, G.M[0][0], G.M[0][1], L * .32);
    tr.addColorStop(0, rgba(K.fin, .7 * fa)); tr.addColorStop(.5, rgba(K.fin, .42 * fa)); tr.addColorStop(1, rgba(K.fin, .12 * fa));
    g.fillStyle = tr; g.fill(G.tail);
    g.lineWidth = Math.max(.4, mw * .035); g.strokeStyle = 'rgba(90,70,50,.16)'; g.beginPath();
    for (let j = -7; j <= 7; j++) { const f = j / 7, kmax = 4 + 2 * Math.abs(f); g.moveTo(G.M[0][0], G.M[0][1]); for (let k = 1; k <= kmax; k++) { const e = G.edge(k, f * .95); g.lineTo(e[0], e[1]); } }
    g.stroke();
    /* ---- paired fins: spread when gliding, folded when sprinting ---- */
    const fold = clamp((this.v / this.cruise - .8) * .6, 0, 1);
    for (const [t, len, spread, open, shut] of [[.2, .22, .48, .64, .86], [.52, .1, .32, .76, .88]]) {
      const S = G.sample(t), ang = Math.atan2(-S[2], S[3]);
      for (const side of [1, -1]) {
        const flap = Math.sin(this.phase * .5 + side * 1.4) * .1 * (1 - fold);
        const f = ang + side * (Math.PI * (open + (shut - open) * fold) + flap);
        const ax = S[0] + S[2] * S[4] * side * .72, ay = S[1] + S[3] * S[4] * side * .72;
        const p = new Path2D(), ed = []; p.moveTo(ax, ay);
        for (let j = 0; j <= 12; j++) { const u = j / 12, a = f - spread + u * spread * 2, r = L * len * Math.pow(Math.sin(u * Math.PI) * .55 + .45, .55) * (u < .5 ? .9 + u * .2 : 1); const e = [ax + Math.cos(a) * r, ay + Math.sin(a) * r]; ed.push(e); p.lineTo(e[0], e[1]); }
        p.closePath();
        const rg = g.createRadialGradient(ax, ay, 0, ax, ay, L * len);
        if (K.motoguro && t < .3) { rg.addColorStop(0, rgba([18, 15, 15], .9 * fa)); rg.addColorStop(.55, rgba([30, 26, 26], .7 * fa)); rg.addColorStop(1, rgba(K.fin, .25 * fa)); }
        else { rg.addColorStop(0, rgba(K.fin, .78 * fa)); rg.addColorStop(.6, rgba(K.fin, .45 * fa)); rg.addColorStop(1, rgba(K.fin, .14 * fa)); }
        g.fillStyle = rg; g.fill(p);
        g.strokeStyle = 'rgba(80,62,44,.16)'; g.lineWidth = Math.max(.35, mw * .03); g.beginPath();
        for (let j = 1; j < ed.length - 1; j++) { g.moveTo(ax, ay); g.quadraticCurveTo(ax + (ed[j][0] - ax) * .5 + side * S[2] * mw * .05, ay + (ed[j][1] - ay) * .5 + side * S[3] * mw * .05, ed[j][0], ed[j][1]); }
        g.stroke();
      }
    }
    /* ---- body ---- */
    g.fillStyle = K.base; g.fill(G.body);
    g.save(); g.clip(G.body);
    if (K.metal) { const sp = new Path2D(); sp.moveTo(G.X[1], G.Y[1]); for (let i = 2; i < N - 1; i++) sp.lineTo(G.X[i], G.Y[i]);
      this.bands(g, sp, this.kind === 'ogon' ? 'rgba(190,100,10,.16)' : 'rgba(120,130,130,.1)', [mw * 1.3, mw * .95, mw * .6, mw * .3], 0, 0); }
    else { // faint warm flush on the head
      const S = G.sample(.05), hg = g.createRadialGradient(S[0], S[1], 0, S[0], S[1], mw * 1.3);
      hg.addColorStop(0, 'rgba(235,180,165,.22)'); hg.addColorStop(1, 'rgba(235,180,165,0)'); g.fillStyle = hg; g.fill(G.body);
    }
    for (const pt of this.patches) {
      const path = new Path2D(), pp = [];
      for (let i = 0; i < pt.v.length; i++) {
        const th = i / pt.v.length * TAU, m = pt.v[i], S = G.sample(pt.t + Math.cos(th) * pt.rt * m), s = pt.s + Math.sin(th) * pt.rs * m;
        pp.push([S[0] + S[2] * s * S[4], S[1] + S[3] * s * S[4]]);
      }
      smooth(path, pp);
      g.save(); g.shadowColor = pt.c; g.shadowBlur = mw * .1 * sc; g.fillStyle = pt.c; g.fill(path); g.restore();
    }
    /* scales: one row of posterior scale edges at a time, following the bend */
    const ssz = mw * .27;
    if (ssz > 1.8) {
      const sp = new Path2D(); let row = 0;
      for (let t = .19; t < .93; t += ssz * .75 / L, row++) {
        const S = G.sample(t), back = Math.atan2(-S[2], S[3]) + Math.PI, stp = ssz * .92 / S[4];
        for (let s = -1 + (row % 2) * stp * .5; s <= 1; s += stp) {
          const k = Math.sqrt(Math.max(.15, 1 - s * s)), cx = S[0] + S[2] * s * S[4], cy = S[1] + S[3] * s * S[4], r = ssz * .55;
          sp.moveTo(cx + Math.cos(back - 1.15) * r * k, cy + Math.sin(back - 1.15) * r * k);
          sp.arc(cx, cy, r * k, back - 1.15, back + 1.15);
        }
      }
      g.lineWidth = Math.max(.45, ssz * .11);
      g.strokeStyle = `rgba(45,25,10,${K.scale})`; g.stroke(sp);
      g.save(); g.translate(-ssz * .09, -ssz * .11); g.strokeStyle = `rgba(255,255,255,${K.scale * (K.metal ? 1.4 : .9)})`; g.stroke(sp); g.restore();
    }
    /* volume: shade the side away from the sun, light the side facing it */
    this.bands(g, G.body, 'rgba(30,14,0,.1)', [mw * .4, mw * .75, mw * 1.1, mw * 1.45], SUN[0] * mw * .3, SUN[1] * mw * .3);
    this.bands(g, G.body, 'rgba(255,253,245,.1)', [mw * .3, mw * .6, mw * .9], -SUN[0] * mw * .2, -SUN[1] * mw * .2);
    this.bands(g, G.body, 'rgba(20,10,0,.08)', [mw * .15, mw * .35], 0, 0);
    /* wet sheen along the back, on the sunward side */
    const side = Math.sign(G.nx[4] * SUN[0] + G.ny[4] * SUN[1]) || 1;
    { const sh = new Path2D();
      for (let t = .06, first = true; t <= (K.metal ? .7 : .48); t += .03, first = false) { const S = G.sample(t), o = side * .32 * S[4]; first ? sh.moveTo(S[0] + S[2] * o, S[1] + S[3] * o) : sh.lineTo(S[0] + S[2] * o, S[1] + S[3] * o); }
      this.bands(g, sh, K.metal ? rgba(K.metal, .2) : 'rgba(255,255,255,.12)', K.metal ? [mw * .7, mw * .45, mw * .25, mw * .1] : [mw * .4, mw * .25, mw * .1], 0, 0); }
    /* head: gill covers, nostrils */
    g.lineWidth = Math.max(.4, mw * .05); g.strokeStyle = 'rgba(60,35,20,.2)';
    for (const sd2 of [1, -1]) {
      const a = G.sample(.15), b = G.sample(.2), c = G.sample(.175);
      g.beginPath(); g.moveTo(a[0] + a[2] * a[4] * .42 * sd2, a[1] + a[3] * a[4] * .42 * sd2);
      g.quadraticCurveTo(b[0] + b[2] * b[4] * .8 * sd2, b[1] + b[3] * b[4] * .8 * sd2, c[0] + c[2] * c[4] * 1.05 * sd2, c[1] + c[3] * c[4] * 1.05 * sd2); g.stroke();
    }
    const Nn = G.sample(.025);
    g.fillStyle = 'rgba(40,25,18,.45)';
    for (const sd2 of [1, -1]) { g.beginPath(); g.arc(Nn[0] + Nn[2] * Nn[4] * .36 * sd2, Nn[1] + Nn[3] * Nn[4] * .36 * sd2, mw * .045, 0, TAU); g.fill(); }
    if (dep > 0) { g.fillStyle = `rgba(32,96,92,${dep * .42})`; g.fill(G.body); }
    g.restore();
    /* dorsal fin, folded flat along the spine */
    g.lineCap = 'round'; g.lineWidth = mw * .11;
    g.strokeStyle = this.kind === 'showa' ? 'rgba(20,16,16,.2)' : this.kind === 'ogon' ? 'rgba(175,95,15,.32)' : 'rgba(150,140,130,.26)';
    g.beginPath();
    for (let t = .3; t <= .66; t += .02) { const S = G.sample(t), o = Math.sin(this.phase - t * 5.2) * mw * .07; t === .3 ? g.moveTo(S[0] + S[2] * o, S[1] + S[3] * o) : g.lineTo(S[0] + S[2] * o, S[1] + S[3] * o); }
    g.stroke();
    /* barbels and eyes */
    const F = G.sample(0);
    g.strokeStyle = this.kind === 'showa' ? 'rgba(90,70,60,.5)' : 'rgba(170,140,120,.55)'; g.lineWidth = Math.max(.4, mw * .05);
    for (const sd2 of [1, -1]) { const bx = F[0] + G.fx * F[4] * .85 + F[2] * F[4] * .3 * sd2, by = F[1] + G.fy * F[4] * .85 + F[3] * F[4] * .3 * sd2;
      g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + G.fx * mw * .25 + F[2] * mw * .22 * sd2, by + G.fy * mw * .25 + F[3] * mw * .22 * sd2); g.stroke(); }
    const E = G.sample(.075);
    for (const sd2 of [1, -1]) {
      const ex = E[0] + E[2] * E[4] * .84 * sd2, ey = E[1] + E[3] * E[4] * .84 * sd2;
      g.fillStyle = 'rgba(190,170,140,.35)'; g.beginPath(); g.arc(ex, ey, mw * .125, 0, TAU); g.fill();
      g.fillStyle = 'rgba(18,14,10,.95)'; g.beginPath(); g.arc(ex, ey, mw * .095, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,255,255,.85)'; g.beginPath(); g.arc(ex + SUN[0] * mw * .035, ey + SUN[1] * mw * .035, mw * .03, 0, TAU); g.fill();
    }
    g.restore();
  }
}

/* ================= WebGL water ================= */
const gl = waterCv.getContext('webgl2', { antialias: false, alpha: true });
let GLS = null, wctx2 = null;
const VS = `#version 300 es
in vec2 p; out vec2 vUv; void main(){ vUv=vec2(p.x*.5+.5,.5-p.y*.5); gl_Position=vec4(p,0.,1.); }`;
const FS = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uScene,uH,uCau,uNoi,uDap;
uniform vec2 uRes,uGrid,uDapOff; uniform float uT,uDapS,uPondR,uAmb,uMoon; uniform vec4 uPond; uniform vec3 uMoonP;
float sdRR(vec2 p){ vec2 c=uPond.xy+uPond.zw*.5; vec2 q=abs(p-c)-(uPond.zw*.5-uPondR); return length(max(q,0.))+min(max(q.x,q.y),0.)-uPondR; }
float hf(vec2 u){ return texture(uH,u).r; }
float nz(vec2 u){ return texture(uNoi,u).r; }
vec2 ng(vec2 q){ float d=1./256.; return vec2(nz(q+vec2(d,0.))-nz(q-vec2(d,0.)), nz(q+vec2(0.,d))-nz(q-vec2(0.,d))); }
void main(){
  vec2 px=vUv*uRes, e=1./uGrid;
  float h=hf(vUv), hl=hf(vUv-vec2(e.x,0.)), hr=hf(vUv+vec2(e.x,0.)), hu=hf(vUv-vec2(0.,e.y)), hd=hf(vUv+vec2(0.,e.y));
  vec2 g=vec2(hr-hl,hd-hu);
  float lap=hl+hr+hu+hd-4.*h;
  vec2 ga=ng(px/520.+uT*vec2(.0021,.0013))*1.0+ng(px/190.+uT*vec2(-.0016,.0027))*.55+ng(px/70.+uT*vec2(.004,-.003))*.25;
  vec2 G=g*.55+ga*uAmb;
  vec3 col=texture(uScene,vUv+G*7./uRes).rgb;
  float light=texture(uDap,(px+uDapOff)/uDapS).r;
  vec2 cp=px/300.;
  float c1=texture(uCau,cp+uT*vec2(.0009,.0005)+G*.015).r;
  float c2=texture(uCau,cp*1.31+vec2(.37,.11)-uT*vec2(.0006,.001)+G*.015).r;
  float cau=pow(min(c1,c2),1.4)*1.7+clamp(-lap*.35,0.,.6);
  col*=mix(.7,1.,light); // prototype: .58; lifted so the shaded water still reads on the home stage
  col+=col*cau*light*.7+vec3(.85,1.,.92)*cau*light*.035;
  vec3 n=normalize(vec3(-G*1.25,1.));
  vec3 sun=normalize(vec3(-.42,-.52,.74)), hv=normalize(sun+vec3(0.,0.,1.));
  float sp=pow(max(dot(n,hv),0.),1400.)*1.1*light + pow(max(dot(n,hv),0.),80.)*.03*light;
  float fres=.02+.98*pow(1.-n.z,5.);
  vec3 sky=mix(vec3(.10,.15,.13),vec3(.80,.88,.90),light);
  col=mix(col,sky,clamp(.035+fres*5.,0.,.4));
  if(uMoon>0.){
    // a crescent like the street's moon, bent by the same ripples that bend the floor
    vec2 mq=px+G*26.+vec2(sin(uT*.011+px.y*.05),0.)*.8;
    float r=uMoonP.z, d=length(mq-uMoonP.xy), d2=length(mq-uMoonP.xy-vec2(r*.38,-r*.2));
    float disc=(1.-smoothstep(r*.8,r,d))*smoothstep(r*.62,r*.9,d2);
    float bloom=(1.-smoothstep(r*.6,r*1.5,d))*smoothstep(r*.4,r*1.1,d2)*.35;
    float glow=exp(-max(d-r*.5,0.)/(r*2.8))*.34;
    col=mix(col,vec3(1.,.94,.76)*(.9+.1*nz(mq/50.)),clamp(disc*.75+bloom,0.,1.)*uMoon);
    col+=vec3(.6,.66,.78)*glow*uMoon;
  }
  col+=vec3(1.,.97,.9)*sp;
  float ins=1.-smoothstep(-1.,1.,sdRR(px));
  o=vec4(col*ins,ins);
}`;
function glTex(unit, wrap, filter) { const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter); return t; }
function initGL() {
  if (!gl) { wctx2 = waterCv.getContext('2d'); return; }
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw gl.getShaderInfoLog(s); return s; };
  const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr); gl.useProgram(pr);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  const U = n => gl.getUniformLocation(pr, n);
  const texScene = glTex(0, gl.CLAMP_TO_EDGE, gl.LINEAR), texH = glTex(1, gl.CLAMP_TO_EDGE, gl.LINEAR);
  glTex(2, gl.REPEAT, gl.LINEAR); gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 256, 256, 0, gl.RED, gl.UNSIGNED_BYTE, causticData());
  glTex(3, gl.REPEAT, gl.LINEAR); gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 256, 256, 0, gl.RED, gl.UNSIGNED_BYTE, Uint8Array.from(N256a, v => v * 255));
  glTex(4, gl.REPEAT, gl.LINEAR); gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, DAP_S, DAP_S, 0, gl.RED, gl.UNSIGNED_BYTE, dapLight);
  ['uScene', 'uH', 'uCau', 'uNoi', 'uDap'].forEach((n, i) => gl.uniform1i(U(n), i));
  GLS = { texScene, texH, U, hw: 0, hh: 0 };
}

/* ================= interaction ================= */
function addFish(kind, splash) {
  const m = baseLen(), side = Math.random() * 4 | 0;
  let x = R(P.x + m, P.x + P.w - m), y = R(P.y + m, P.y + P.h - m);
  if (splash) { if (side === 0) y = P.y + m * .8; else if (side === 1) y = P.y + P.h - m * .8; else if (side === 2) x = P.x + m * .8; else x = P.x + P.w - m * .8; }
  const a = splash ? Math.atan2(P.y + P.h / 2 - y, P.x + P.w / 2 - x) + R(-.5, .5) : R(0, TAU);
  const f = new Koi(kind, x, y, a);
  if (splash) { f.born = reduce ? 1 : 0; f.depth = .05; f.dT = .4; f.beating = true; f.beatT = 90; f.v = f.cruise * 2.4; drop(x, y, m * .5, 9); drop(x, y, m * .2, -6); }
  fish.push(f); if (fish.length > 30) fish.shift();
  onCount(fish.length);
}
function feed(x, y) {
  drop(x, y, 14, 7);
  const n = 7 + (Math.random() * 5 | 0);
  for (let i = 0; i < n; i++) {
    const a = R(0, TAU), d = R(5, 34), fx = x + Math.cos(a) * d, fy = y + Math.sin(a) * d;
    if (sd(fx, fy) < -8) { foods.push({ x: fx, y: fy, vx: 0, vy: 0, life: 1, r: R(2.2, 3.4), h: R(22, 32) }); drop(fx, fy, 5, 2.5); }
  }
}
let down = null;
// Pointer positions relative to the pond, wherever the stage sits on the page.
const local = e => { const r = surf.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
surf.addEventListener('pointerdown', e => { const [x, y] = local(e); down = { x, y, moved: 0 }; surf.setPointerCapture(e.pointerId); });
surf.addEventListener('pointermove', e => {
  if (!down) return; const [x, y] = local(e), dx = x - down.x, dy = y - down.y, d = Math.hypot(dx, dy); if (d < 3) return;
  down.moved += d; down.x = x; down.y = y;
  if (sd(x, y) < -6) drop(x, y, 12, clamp(d * .25, .5, 3.5));
});
surf.addEventListener('pointerup', e => { const [x, y] = local(e); if (down && down.moved < 8 && sd(x, y) < -6) feed(x, y); down = null; });
surf.addEventListener('pointercancel', () => { down = null; });

/** Draw a still koi of `kind` into a 144x60 canvas, for the variety tray. */
function drawIcon(k, c) {
  c.width = 144; c.height = 60; const g = c.getContext('2d'); g.setTransform(2, 0, 0, 2, 0, 0); g.clearRect(0, 0, 72, 30);
  const f = new Koi(k, 60, 15, 0, 46); f.amp = .25; f.phase = 1.6;
  if (k === 'kohaku') f.patches = [{ t: .07, s: 0, rt: .07, rs: .9, v: Array(14).fill(1), c: '#cf3a1d' }, { t: .4, s: .15, rt: .13, rs: 1.1, v: Array.from({ length: 14 }, () => R(.8, 1.15)), c: '#cf3a1d' }];
  if (k === 'showa') f.patches = [{ t: .08, s: 0, rt: .07, rs: .9, v: Array(14).fill(1), c: '#cf3a1d' }, { t: .35, s: -.4, rt: .1, rs: 1.3, v: Array(14).fill(1), c: '#151212' }, { t: .6, s: .5, rt: .1, rs: 1.2, v: Array(14).fill(1), c: '#151212' }, { t: .45, s: .3, rt: .06, rs: .7, v: Array(14).fill(1), c: '#cf3a1d' }];
  f.geom(); f.render(g, true);
}

/* ================= frame ================= */
function resize() {
  DPR = Math.min(1.5, window.devicePixelRatio || 1); SD = Math.min(DPR, 1.25); W = Math.max(1, host.clientWidth); H = Math.max(1, host.clientHeight);
  surf.width = W * DPR; surf.height = H * DPR; waterCv.width = W * DPR; waterCv.height = H * DPR;
  B = clamp(Math.min(W, H) * .075, 30, 70);
  P = { x: B, y: B, w: W - B * 2, h: H - B * 2, r: B * .9 };
  scene = mk(W, H, SD); sg = scene.g; shC = mk(W, H, SHF);
  buildFloor(); buildStones(); buildPads(); initField();
  dapPat = sctx.createPattern(dapCanvas, 'repeat');
  for (const f of fish) if (sd(f.pts[0].x, f.pts[0].y) > -f.mw) { const nx = R(P.x + 50, P.x + P.w - 50), ny = R(P.y + 50, P.y + P.h - 50); for (const p of f.pts) { p.x = nx; p.y = ny; } }
  if (GLS) GLS.hw = 0;
}
let last = performance.now(), acc = 0, rT;
function frame(now) {
  const dt = Math.min(50, now - last); last = now; const k = dt / 16.67; t0 += reduce ? 0 : k;
  acc += dt; let n = 0; while (acc > 16.67 && n < 3) { step(); acc -= 16.67; n++; } if (n === 3) acc = 0;
  if (!reduce && Math.random() < .004 * k) { const x = R(P.x + 20, P.x + P.w - 20), y = R(P.y + 20, P.y + P.h - 20); drop(x, y, 4, R(1.5, 3)); }
  for (const f of fish) { if (!reduce) f.update(k); f.geom(); }
  // underwater scene
  sg.drawImage(floorC, 0, 0, W, H);
  shC.g.setTransform(SHF, 0, 0, SHF, 0, 0); shC.g.clearRect(0, 0, W, H);
  for (const f of fish) f.shadow(shC.g);
  sg.imageSmoothingQuality = 'high'; sg.drawImage(shC, 0, 0, W, H);
  const order = fish.slice().sort((a, b) => b.depth - a.depth);
  for (const f of order) f.render(sg, false);
  // water
  const dapOff = [t0 * .09 + Math.sin(t0 * .004) * 18, t0 * .05 + Math.cos(t0 * .0033) * 12], dapS = 900;
  if (GLS) {
    const { U } = GLS;
    gl.viewport(0, 0, waterCv.width, waterCv.height);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, GLS.texScene); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, scene);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, GLS.texH);
    if (GLS.hw !== gw || GLS.hh !== gh) { gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, gw, gh, 0, gl.RED, gl.FLOAT, h0); GLS.hw = gw; GLS.hh = gh; }
    else gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gw, gh, gl.RED, gl.FLOAT, h0);
    gl.uniform2f(U('uRes'), W, H); gl.uniform2f(U('uGrid'), gw, gh); gl.uniform1f(U('uT'), t0);
    gl.uniform4f(U('uPond'), P.x, P.y, P.w, P.h); gl.uniform1f(U('uPondR'), P.r);
    gl.uniform2f(U('uDapOff'), dapOff[0], dapOff[1]); gl.uniform1f(U('uDapS'), dapS); gl.uniform1f(U('uAmb'), 6.5);
    moonA = reduce ? moonT : moonA + (moonT - moonA) * Math.min(1, .02 * k);
    gl.uniform1f(U('uMoon'), moonA < .005 ? 0 : moonA);
    gl.uniform3f(U('uMoonP'), P.x + P.w * .7, P.y + P.h * .44, clamp(Math.sqrt(P.w * P.h) * .07, 22, 60));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  } else { wctx2.setTransform(1, 0, 0, 1, 0, 0); wctx2.drawImage(scene, 0, 0, waterCv.width, waterCv.height); }
  // surface layer
  const g = sctx; g.setTransform(DPR, 0, 0, DPR, 0, 0); g.clearRect(0, 0, W, H);
  for (const p of pads) {
    const gr = fieldGrad(p.bx, p.by); p.ox += (-gr[0] * 1.2 - p.ox) * .05 * k; p.oy += (-gr[1] * 1.2 - p.oy) * .05 * k;
    const bob = reduce ? 0 : Math.sin(t0 * .008 + p.ph);
    p.x = p.bx + p.ox + bob * 1.2; p.y = p.by + p.oy + Math.cos(t0 * .007 + p.ph) * 1;
    g.save(); g.translate(p.x, p.y); g.rotate(p.rot + bob * .03);
    g.shadowColor = 'rgba(2,22,20,.5)'; g.shadowBlur = p.r * .22 * DPR; g.shadowOffsetX = p.r * .16 * DPR; g.shadowOffsetY = p.r * .22 * DPR;
    g.drawImage(p.spr, -p.spr.m, -p.spr.m, p.spr.m * 2, p.spr.m * 2); g.restore();
  }
  for (const l of leaves) {
    const gr = fieldGrad(l.x, l.y); l.vx += -gr[0] * .02 * k; l.vy += -gr[1] * .02 * k; l.vx *= .995; l.vy *= .995;
    l.x += l.vx * k; l.y += l.vy * k; l.rot += l.vr * k;
    if (sd(l.x, l.y) > -l.L * .6) { const cx = P.x + P.w / 2 - l.x, cy = P.y + P.h / 2 - l.y, cl = Math.hypot(cx, cy); l.vx = cx / cl * .08; l.vy = cy / cl * .08; }
    g.save(); g.translate(l.x, l.y); g.rotate(l.rot);
    g.shadowColor = 'rgba(2,22,20,.45)'; g.shadowBlur = 4 * DPR; g.shadowOffsetX = 5 * DPR; g.shadowOffsetY = 7 * DPR;
    g.drawImage(l.spr, -l.spr.m, -l.spr.m, l.spr.m * 2, l.spr.m * 2); g.restore();
  }
  for (let i = foods.length - 1; i >= 0; i--) {
    const f = foods[i], gr = fieldGrad(f.x, f.y); f.vx += -gr[0] * .03 * k + R(-.006, .006); f.vy += -gr[1] * .03 * k + R(-.006, .006); f.vx *= .97; f.vy *= .97;
    f.x += f.vx * k; f.y += f.vy * k; f.life -= .0009 * k;
    if (f.eaten || f.life <= 0 || sd(f.x, f.y) > -3) { foods.splice(i, 1); continue; }
    g.globalAlpha = Math.min(1, f.life * 5);
    g.fillStyle = 'rgba(0,20,18,.28)'; g.beginPath(); g.arc(f.x + 3, f.y + 4, f.r * 1.1, 0, TAU); g.fill();
    const pg = g.createRadialGradient(f.x - f.r * .35, f.y - f.r * .35, 0, f.x, f.y, f.r);
    pg.addColorStop(0, `hsl(${f.h},55%,58%)`); pg.addColorStop(1, `hsl(${f.h},60%,30%)`);
    g.fillStyle = pg; g.beginPath(); g.arc(f.x, f.y, f.r, 0, TAU); g.fill();
  }
  g.globalAlpha = 1;
  g.drawImage(stonesC, 0, 0, W, H);
  dapPat.setTransform(new DOMMatrix().translate(-dapOff[0], -dapOff[1]).scale(dapS / DAP_S));
  g.globalCompositeOperation = 'source-atop'; g.fillStyle = dapPat; g.fillRect(0, 0, W, H); g.globalCompositeOperation = 'source-over';
  raf = requestAnimationFrame(loop);
}

let raf = 0, stopped = false;
function loop(now) { raf = 0; if (stopped || document.hidden) return; frame(now); }
function wake() { if (!stopped && !raf && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(loop); } }
resize(); initGL();
const start = { kohaku: 5, showa: 3, ogon: 2, platinum: 2 };
for (const k in start) for (let i = 0; i < start[k]; i++) addFish(k, false);
const ro = new ResizeObserver(() => { clearTimeout(rT); rT = setTimeout(resize, 150); });
ro.observe(host);
document.addEventListener('visibilitychange', wake);
wake();
return {
  addFish: kind => { if (KINDS[kind]) addFish(kind, true); },
  drawIcon: (kind, canvas) => { if (KINDS[kind]) drawIcon(kind, canvas); },
  setNight(on) { moonT = on ? 1 : 0; },
  destroy() {
    stopped = true; if (raf) cancelAnimationFrame(raf); raf = 0; clearTimeout(rT);
    ro.disconnect(); document.removeEventListener('visibilitychange', wake);
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    waterCv.remove(); surf.remove();
  },
};
}
