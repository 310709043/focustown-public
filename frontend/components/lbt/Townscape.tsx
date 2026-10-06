/**
 * The home stage's sky and street. Purely decorative (aria-hidden).
 *
 * Both streets are rendered and CSS shows one: <html data-lbt-week> picks
 * the weekday city or the weekend apartment lane, <html data-lbt-time>
 * (dawn / day / dusk / night) colours them and decides which windows are
 * lit, whether street lamp 07 is on and what moves. Doing it in CSS keeps
 * the server HTML identical for everyone, so nothing flashes on load.
 *
 * Window lighting is fixed per window (no randomness at render time):
 * "l1" windows light at dusk, "l2" only at night.
 */

type Lit = "" | "l1" | "l2";

interface Block {
  x: number;
  top: number;
  w: number;
  cols: number;
  rows: number;
  tone: 1 | 2 | 3;
}

const GROUND = 190;

/** Deterministic pattern: a fifth lit at dusk, two fifths at night. */
function litFor(i: number): Lit {
  const n = (i * 37 + 11) % 10;
  if (n < 2) return "l1";
  if (n < 4) return "l2";
  return "";
}

/**
 * A handful of windows live a little at night (fixed per window, no
 * randomness): "lf-on" someone comes home, "lf-off" someone goes to bed,
 * "lf-tv" the blue flicker of a television.
 */
const LIFE: Record<number, string> = { 3: "lf-on", 11: "lf-off", 19: "lf-tv", 27: "lf-on lf-late" };
function lifeFor(i: number): string {
  return LIFE[(i * 13 + 5) % 41] ?? "";
}

function windows(b: Block, key: string, padX: number, padTop: number, gap: number, grille = false) {
  const cw = (b.w - padX * 2 - gap * (b.cols - 1)) / b.cols;
  const ch = Math.min(cw * 1.2, (GROUND - b.top - padTop - 18 - gap * (b.rows - 1)) / b.rows);
  const out = [];
  for (let r = 0; r < b.rows; r += 1) {
    for (let c = 0; c < b.cols; c += 1) {
      const i = r * b.cols + c + b.x;
      const lit = `${litFor(i)} ${lifeFor(i)}`.trim();
      const x = b.x + padX + c * (cw + gap);
      const y = b.top + padTop + r * (ch + gap);
      out.push(<rect key={`${key}-${r}-${c}`} className={`tw-win ${lit}`.trim()} x={x} y={y} width={cw} height={ch} />);
      // iron window grille (鐵窗) on the old apartments
      if (grille) {
        out.push(<rect key={`${key}-${r}-${c}-g`} className="tw-grille-sheet" x={x} y={y} width={cw} height={ch} fill="url(#tw-grille)" />);
      }
    }
  }
  return out;
}

const WEEKDAY: Block[] = [
  { x: 18, top: 78, w: 150, cols: 5, rows: 4, tone: 1 },
  { x: 186, top: 34, w: 104, cols: 3, rows: 6, tone: 2 },
  { x: 372, top: 96, w: 150, cols: 5, rows: 3, tone: 3 },
  { x: 540, top: 52, w: 156, cols: 4, rows: 5, tone: 1 },
  { x: 836, top: 84, w: 126, cols: 4, rows: 4, tone: 2 },
  { x: 980, top: 44, w: 200, cols: 6, rows: 5, tone: 3 },
];

const WEEKEND: Block[] = [
  { x: 16, top: 70, w: 190, cols: 3, rows: 4, tone: 1 },
  { x: 222, top: 30, w: 128, cols: 2, rows: 5, tone: 2 },
  { x: 404, top: 98, w: 220, cols: 3, rows: 3, tone: 3 },
  { x: 870, top: 62, w: 170, cols: 3, rows: 4, tone: 2 },
  { x: 1056, top: 40, w: 132, cols: 2, rows: 5, tone: 1 },
];

function StreetLamp({ x }: { x: number }) {
  return (
    <g className="tw-lamp">
      <polygon className="tw-beam" points={`${x + 34},84 ${x + 50},84 ${x + 104},${GROUND} ${x - 18},${GROUND}`} />
      <path className="tw-pole" d={`M${x} ${GROUND}V104c0-18 12-26 30-26`} />
      <path className="tw-lamp-head" d={`M${x + 24} 72h32c3 0 5 2 4 5l-2 7h-36l-2-7c-1-3 1-5 4-5z`} />
      <ellipse className="tw-bulb" cx={x + 40} cy={85} rx={13} ry={3} />
      {/* moths circling the bulb at night */}
      <g className="tw-moths">
        <circle className="tw-moth m1" cx={x + 40} cy={98} r={1.4} />
        <circle className="tw-moth m2" cx={x + 40} cy={98} r={1.1} />
        <circle className="tw-moth m3" cx={x + 40} cy={98} r={1.2} />
      </g>
      <rect className="tw-plate" x={x - 7} y={136} width={14} height={18} rx={2} />
      <text className="tw-plate-text" x={x} y={149}>
        07
      </text>
    </g>
  );
}

function WeekdayStreet() {
  return (
    <svg className="tw-street tw-weekday" viewBox="0 0 1200 200" preserveAspectRatio="xMidYMax slice" focusable="false">
      <path
        className="tw-far"
        d="M0 200V118h46V96h58v30h70V84h40v40h150V102h60v26h104V90h70v34h90V74h62v44h118V96h70v30h84V200Z"
      />
      <g className="tw-hand">
        {WEEKDAY.map((b, k) => (
          <g key={`wd-${k}`}>
            <rect className={`tw-block tw-tone${b.tone}`} x={b.x} y={b.top} width={b.w} height={GROUND - b.top} />
            {windows(b, `wd${k}`, 12, 14, 7)}
          </g>
        ))}
        <path className="tw-edge" d="M210 34V22M260 34V16" />
        <rect className="tw-block tw-tone2" x={604} y={40} width={36} height={12} />
        {/* bus stop: the weekday commute */}
        <rect className="tw-pole-thin" x={322} y={124} width={3} height={66} />
        <rect className="tw-bus-sign" x={311} y={110} width={25} height={17} rx={3} />
        <rect className="tw-bus-mark" x={316} y={116} width={15} height={5} rx={1.5} />
        <rect className="tw-shelter" x={338} y={150} width={28} height={4} />
        <rect className="tw-pole-thin" x={340} y={154} width={2} height={36} />
        <rect className="tw-pole-thin" x={362} y={154} width={2} height={36} />
      </g>
      {/* the last bus home: crosses the street now and then at night */}
      <g className="tw-bus">
        <rect className="tw-bus-body" x={0} y={160} width={96} height={27} rx={5} />
        {[8, 26, 44, 62].map((wx) => (
          <rect key={wx} className="tw-bus-win" x={wx} y={165} width={14} height={9} rx={1.5} />
        ))}
        <rect className="tw-bus-win" x={80} y={165} width={10} height={14} rx={1.5} />
        <circle className="tw-bus-wheel" cx={20} cy={187} r={4.5} />
        <circle className="tw-bus-wheel" cx={76} cy={187} r={4.5} />
        <rect className="tw-bus-light" x={93} y={178} width={3} height={4} rx={1} />
      </g>
      <StreetLamp x={750} />
      <rect className="tw-ground" x={0} y={GROUND} width={1200} height={10} />
    </svg>
  );
}

function WeekendStreet() {
  return (
    <svg className="tw-street tw-weekend" viewBox="0 0 1200 200" preserveAspectRatio="xMidYMax slice" focusable="false">
      <defs>
        <pattern id="tw-grille" width="5" height="40" patternUnits="userSpaceOnUse">
          <path className="tw-grille" d="M2.5 0V40" />
        </pattern>
        <pattern id="tw-slats" width="40" height="4" patternUnits="userSpaceOnUse">
          <path className="tw-grille" d="M0 3.5H40" />
        </pattern>
        <pattern id="tw-tin" width="5" height="40" patternUnits="userSpaceOnUse">
          <path className="tw-grille" d="M2.5 0V40" />
        </pattern>
      </defs>
      <path
        className="tw-far"
        d="M0 200V112h52V92h46v28h80V80h36v36h196V98h50v24h120V86h64v30h96V76h58v40h110V94h60v30h80V200Z"
      />
      <path className="tw-wire" d="M0 40C80 56 160 60 222 54" />
      <path className="tw-wire" d="M350 60C500 96 640 100 760 104" />
      <path className="tw-wire" d="M1040 70C1100 52 1150 46 1200 44" />
      <g className="tw-hand">
        {WEEKEND.map((b, k) => (
          <g key={`we-${k}`}>
            <rect className={`tw-block tw-tone${b.tone}`} x={b.x} y={b.top} width={b.w} height={GROUND - b.top} />
            {windows(b, `we${k}`, 16, 16, 12, true)}
          </g>
        ))}
        {/* rooftop water tanks, tin add-on, plants */}
        <rect className="tw-tank" x={140} y={46} width={44} height={24} rx={5} />
        <rect className="tw-tank" x={1128} y={20} width={36} height={20} rx={4} />
        <polygon className="tw-tin" points="430,98 430,74 590,68 590,98" />
        <polygon points="430,98 430,74 590,68 590,98" fill="url(#tw-tin)" />
        <rect className="tw-pot" x={28} y={58} width={12} height={12} />
        <path className="tw-plant" d="M26 60c-4-12 6-14 8-7 2-9 12-8 8 3 6-2 7 5 1 5z" />
        <rect className="tw-pot" x={884} y={50} width={12} height={12} />
        <path className="tw-plant" d="M882 52c-5-13 6-15 8-6 3-9 13-6 8 4 6-1 6 5 0 4z" />
        {/* AC units */}
        <rect className="tw-ac" x={176} y={96} width={22} height={13} rx={1.5} />
        <rect className="tw-ac" x={612} y={124} width={22} height={13} rx={1.5} />
        <rect className="tw-ac" x={1018} y={110} width={22} height={13} rx={1.5} />
        {/* breakfast shop: shutter down at the weekend, a note taped on */}
        <rect className="tw-sign" x={340} y={58} width={22} height={70} rx={2} />
        <text className="tw-sign-text" x={351} y={84}>
          早
        </text>
        <text className="tw-sign-text" x={351} y={104}>
          餐
        </text>
        <rect className="tw-shutter" x={230} y={156} width={112} height={34} />
        <rect x={230} y={156} width={112} height={34} fill="url(#tw-slats)" />
        <rect className="tw-note" x={276} y={164} width={20} height={14} />
        <rect className="tw-shop" x={884} y={168} width={140} height={22} />
        <rect className="tw-sign" x={888} y={150} width={84} height={16} rx={2} />
      </g>
      {/* laundry pole off the low building: sways by day */}
      <path className="tw-pole-line" d="M610 112L668 108" />
      <g className="tw-laundry">
        <path className="tw-cloth-a" d="M618 112h18l5 6-5 3v18h-18v-18l-5-3z" />
        <rect className="tw-cloth-b" x={646} y={110} width={11} height={22} />
      </g>
      {/* the cat: asleep on the roof by day, under the lamp at night */}
      <g className="tw-cat tw-cat-roof">
        <path d="M520 98c0-8 7-12 16-12 8 0 14 4 14 10 0 2-1 2-3 2h-24c-2 0-3 0-3 0z" />
        <path className="tw-cat-tail" d="M548 96c6 0 8-4 6-8" />
      </g>
      <g className="tw-cat tw-cat-lamp">
        <path d="M790 190c-2-7 1-14 7-16l-1-7 4 4h5l4-4-1 7c5 2 7 9 5 16z" />
        <path className="tw-cat-tail" d="M812 189c8-1 10-8 6-12" />
      </g>
      <StreetLamp x={760} />
      <rect className="tw-ground" x={0} y={GROUND} width={1200} height={10} />
    </svg>
  );
}

/** Sky layer for the whole stage: sun, moon, a few stars, slow clouds. */
export function TownSky() {
  return (
    <div className="town-sky" aria-hidden="true">
      <span className="sky-sun" />
      <span className="sky-moon-glow" />
      <svg className="sky-moon" viewBox="0 0 40 40" focusable="false">
        <path d="M24 4a17 17 0 1 0 12 26A14 14 0 1 1 24 4z" />
      </svg>
      <span className="sky-star s1" />
      <span className="sky-star s2" />
      <span className="sky-star s3" />
      <span className="sky-star s4" />
      <span className="sky-star s5" />
      <span className="sky-star s6" />
      <span className="sky-star s7" />
      <span className="sky-star s8" />
      <span className="sky-star s9" />
      <span className="sky-star s10" />
      <span className="sky-star s11" />
      <span className="sky-meteor m1" />
      <span className="sky-meteor m2" />
      <span className="sky-plane" />
      {/* birds: a pair by morning, a few by day, a flock heading home at dusk */}
      <svg className="sky-birds b1" viewBox="0 0 60 24" focusable="false">
        <path className="bird w1" d="M2 12q5-6 9 0q4-6 9 0" />
        <path className="bird w2" d="M26 6q4-5 8 0q4-5 8 0" />
        <path className="bird w3" d="M40 17q4-5 7 0q3-5 7 0" />
      </svg>
      <svg className="sky-birds b2" viewBox="0 0 60 24" focusable="false">
        <path className="bird w2" d="M4 10q4-5 8 0q4-5 8 0" />
        <path className="bird w1" d="M30 16q4-5 7 0q3-5 7 0" />
      </svg>
      <svg className="sky-cloud c1" viewBox="0 0 120 34" focusable="false">
        <path d="M8 26h104a6 6 0 0 1 0 8H8a6 6 0 0 1 0-8zM30 16h52a5 5 0 0 1 0 10H30a5 5 0 0 1 0-10z" />
      </svg>
      <svg className="sky-cloud c2" viewBox="0 0 120 34" focusable="false">
        <path d="M4 26h80a5 5 0 0 1 0 8H4a5 5 0 0 1 0-8zM22 18h34a4 4 0 0 1 0 8H22a4 4 0 0 1 0-8z" />
      </svg>
    </div>
  );
}

export function Townscape() {
  return (
    <div className="townscape" aria-hidden="true">
      {/* A slight hand-drawn wobble for the static street (animated bits sit outside it). */}
      <svg className="tw-defs" width="0" height="0" focusable="false">
        <filter id="tw-hand-filter" x="-1%" y="-1%" width="102%" height="102%">
          <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves={2} seed={4} />
          <feDisplacementMap in="SourceGraphic" scale={1.8} />
        </filter>
      </svg>
      <WeekdayStreet />
      <WeekendStreet />
    </div>
  );
}
