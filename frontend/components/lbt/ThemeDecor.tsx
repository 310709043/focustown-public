/**
 * Decorations that come with a style pack (preview only for now). Every
 * pack's pieces are rendered and CSS shows the ones matching
 * <html data-lbt-theme>, like the two streets in Townscape.
 *
 * - ThemeSkyDecor covers the stage: sakura petals, soda bubbles, warm
 *   lantern glows, pixel sparkles.
 * - ThemeStreetDecor shares the street's drawing space (same viewBox as
 *   Townscape), standing one object on the road left of lamp 07: a bubble
 *   tea, a blossoming tree, a soda machine, an arcade cabinet.
 *
 * Positions are fixed (no randomness at render), aria-hidden, and under
 * reduced motion everything stands still.
 */
import type { CSSProperties, ReactNode } from "react";

const VIEWBOX = "0 -110 1200 310";
const GROUND = 190;

type Bit = { x: number; d: number; t: number; s: number };

/** Deterministic spread: left %, delay s, duration s, size px. */
function bits(n: number, seed: number, minT: number, spanT: number, minS: number, spanS: number): Bit[] {
  return Array.from({ length: n }, (_, i) => ({
    x: (i * 61 + seed * 17) % 100,
    d: ((i * 37 + seed) % 90) / 10,
    t: minT + ((i * 29 + seed) % 10) * (spanT / 10),
    s: minS + ((i * 13 + seed) % 5) * (spanS / 5),
  }));
}

const style = (b: Bit): CSSProperties =>
  ({ "--x": `${b.x}%`, "--d": `${-b.d}s`, "--t": `${b.t}s`, "--s": `${b.s}px` }) as CSSProperties;

export function ThemeSkyDecor() {
  return (
    <div className="theme-sky" aria-hidden="true">
      <div className="decor decor-sakura">
        {bits(16, 3, 9, 7, 9, 6).map((b, i) => (
          <span key={i} className="decor-petal" style={style(b)} />
        ))}
      </div>
      <div className="decor decor-mint">
        {bits(14, 5, 8, 8, 6, 12).map((b, i) => (
          <span key={i} className="decor-bubble" style={style(b)} />
        ))}
      </div>
      <div className="decor decor-milktea">
        {bits(7, 2, 10, 8, 26, 30).map((b, i) => (
          <span key={i} className="decor-glow" style={{ ...style(b), "--y": `${12 + ((i * 23) % 50)}%` } as CSSProperties} />
        ))}
      </div>
      <div className="decor decor-pixel">
        {bits(10, 7, 2, 3, 3, 3).map((b, i) => (
          <span key={i} className="decor-spark" style={{ ...style(b), "--y": `${6 + ((i * 19) % 46)}%` } as CSSProperties} />
        ))}
      </div>
    </div>
  );
}

function BubbleTea({ x, g = GROUND }: { x: number; g?: number }) {
  const top = g - 40;
  return (
    <g className="decor-milktea">
      <path className="bt-steam s1" d={`M${x + 8} ${top - 8}c-4-6 4-10 0-16`} />
      <path className="bt-steam s2" d={`M${x + 16} ${top - 10}c-4-6 4-10 0-16`} />
      <rect className="bt-straw" x={x + 14} y={top - 14} width={4} height={20} rx={1} transform={`rotate(12 ${x + 16} ${top})`} />
      <path className="bt-cup" d={`M${x} ${top}h28l-3 40h-22z`} />
      <path className="bt-tea" d={`M${x + 1.2} ${top + 8}h25.6l-2.4 32h-20.8z`} />
      {[5, 11, 17, 23, 8, 14, 20].map((px, i) => (
        <circle key={i} className="bt-pearl" cx={x + px} cy={top + (i < 4 ? 36 : 31)} r={2.4} />
      ))}
      <rect className="bt-lid" x={x - 1.5} y={top - 2.5} width={31} height={4} rx={2} />
      <text className="bt-label" x={x + 14} y={top + 22}>
        珍奶
      </text>
    </g>
  );
}

function SakuraTree({ x, g = GROUND }: { x: number; g?: number }) {
  return (
    <g className="decor-sakura">
      <path className="sk-trunk" d={`M${x} ${g}c2-22-4-38 4-56M${x + 3} ${g - 40}c8-6 14-8 22-16M${x + 2} ${g - 30}c-8-4-14-10-18-18`} />
      {[
        [x + 6, g - 64, 16],
        [x + 26, g - 58, 13],
        [x - 14, g - 52, 13],
        [x + 14, g - 78, 12],
        [x - 6, g - 74, 11],
        [x + 32, g - 72, 9],
      ].map(([cx, cy, r], i) => (
        <circle key={i} className={`sk-bloom b${i % 3}`} cx={cx} cy={cy} r={r} />
      ))}
      <ellipse className="sk-fallen" cx={x + 6} cy={g + 2} rx={30} ry={2.4} />
    </g>
  );
}

function SodaMachine({ x, g = GROUND }: { x: number; g?: number }) {
  const top = g - 62;
  return (
    <g className="decor-mint">
      <rect className="sm-glow" x={x - 10} y={top - 6} width={56} height={74} rx={10} />
      <rect className="sm-body" x={x} y={top} width={36} height={62} rx={3} />
      <rect className="sm-panel" x={x + 4} y={top + 5} width={20} height={36} rx={1.5} />
      {[0, 1, 2].map((r) =>
        [0, 1, 2].map((c) => <rect key={`${r}-${c}`} className={`sm-can c${(r + c) % 3}`} x={x + 6 + c * 6} y={top + 8 + r * 11} width={4} height={8} rx={1} />),
      )}
      <rect className="sm-coin" x={x + 27} y={top + 12} width={5} height={10} rx={1} />
      <rect className="sm-slot" x={x + 6} y={top + 47} width={20} height={7} rx={1} />
      <text className="sm-label" x={x + 18} y={top - 2}>
        SODA
      </text>
    </g>
  );
}

function Arcade({ x, g = GROUND }: { x: number; g?: number }) {
  const top = g - 60;
  return (
    <g className="decor-pixel" shapeRendering="crispEdges">
      <rect className="ar-glow" x={x - 8} y={top - 4} width={46} height={70} />
      <rect className="ar-body" x={x} y={top} width={30} height={60} />
      <rect className="ar-top" x={x - 2} y={top - 2} width={34} height={10} />
      <rect className="ar-screen" x={x + 4} y={top + 12} width={22} height={18} />
      <rect className="ar-pix p1" x={x + 8} y={top + 16} width={4} height={4} />
      <rect className="ar-pix p2" x={x + 16} y={top + 22} width={4} height={4} />
      <rect className="ar-deck" x={x - 2} y={top + 32} width={34} height={8} />
      <rect className="ar-btn b1" x={x + 6} y={top + 34} width={4} height={3} />
      <rect className="ar-btn b2" x={x + 14} y={top + 34} width={4} height={3} />
      <rect className="ar-btn b3" x={x + 22} y={top + 34} width={4} height={3} />
    </g>
  );
}

/** Scale a street object up from its foot, so it stays on the road. */
function Grow({ x, k, g = GROUND, children }: { x: number; k: number; g?: number; children: ReactNode }) {
  return <g transform={`translate(${x} ${g}) scale(${k}) translate(${-x} ${-g})`}>{children}</g>;
}

export function ThemeStreetDecor() {
  return (
    <svg className="tw-street tw-decor-layer" viewBox={VIEWBOX} preserveAspectRatio="xMidYMax slice" focusable="false">
      <Grow x={700} k={1.6}>
        <BubbleTea x={690} />
      </Grow>
      <Grow x={700} k={1.35}>
        <SakuraTree x={700} />
      </Grow>
      <Grow x={698} k={1.45}>
        <SodaMachine x={680} />
      </Grow>
      <Grow x={699} k={1.45}>
        <Arcade x={684} />
      </Grow>
    </svg>
  );
}

/**
 * The same objects beside the chat bench (BenchScene's 1344 × 260 canvas,
 * road at y = 250), well left of the bench and the name tags beside it.
 */
export function ThemeBenchDecor() {
  const g = 250;
  return (
    <g className="bench-decor">
      <Grow x={330} k={1.7} g={g}>
        <BubbleTea x={316} g={g} />
      </Grow>
      <Grow x={320} k={1.5} g={g}>
        <SakuraTree x={320} g={g} />
      </Grow>
      <Grow x={330} k={1.55} g={g}>
        <SodaMachine x={312} g={g} />
      </Grow>
      <Grow x={330} k={1.55} g={g}>
        <Arcade x={315} g={g} />
      </Grow>
    </g>
  );
}
