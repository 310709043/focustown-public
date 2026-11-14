/**
 * 下雨的小鎮: a paid look for the home street (preview only for now).
 *
 * Two decorative layers, both aria-hidden and empty of text:
 * - RainSky covers the whole stage: an overcast veil and two depths of
 *   falling rain (CSS backgrounds, no per-drop DOM nodes).
 * - RainStreet shares the street's drawing space (same viewBox and
 *   preserveAspectRatio as Townscape), so the drops caught in lamp 07's
 *   light, the wet ground and its reflection, and the puddle ripples sit
 *   exactly on the street. Lamp 07 is at x = 750 on the weekday street and
 *   x = 760 at the weekend; CSS shows the matching group.
 *
 * Everything else (sun, moon, stars, birds) is dimmed or hidden by
 * `.main-stage.is-rain` rules in lbt.css. Under reduced motion the rain
 * stands still.
 */

const VIEWBOX = "0 -110 1200 310";
const GROUND = 190;

/** Deterministic drops inside a lamp's beam (no randomness at render). */
function litDrops(x: number) {
  const drops = [];
  for (let i = 0; i < 26; i += 1) {
    const dx = x - 16 + ((i * 47) % 118);
    const dy = 80 + ((i * 61) % 112);
    const len = 7 + ((i * 13) % 6);
    drops.push(<path key={i} d={`M${dx} ${dy}l-1.6 ${len}`} />);
  }
  return drops;
}

function LampRain({ x, week }: { x: number; week: "wd" | "we" }) {
  const clip = `rain-beam-${week}`;
  return (
    <g className={`rain-lamp rain-${week}`}>
      <defs>
        <clipPath id={clip}>
          <polygon points={`${x + 34},84 ${x + 50},84 ${x + 104},${GROUND} ${x - 18},${GROUND}`} />
        </clipPath>
        <linearGradient id={`rain-reflect-${week}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--rain-glow)" stopOpacity="0.85" />
          <stop offset="1" stopColor="var(--rain-glow)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* drops lit by the lamp: two copies, one a beam-height above, loop seamlessly */}
      <g clipPath={`url(#${clip})`}>
        <g className="rain-lit">
          {litDrops(x + 40)}
          <g transform="translate(0 -112)">{litDrops(x + 40)}</g>
        </g>
      </g>
      {/* the lamp's light on the wet road, broken into a long streaky reflection */}
      <ellipse className="rain-pool" cx={x + 40} cy={GROUND + 3} rx={66} ry={4.5} />
      <rect className="rain-reflect" x={x + 30} y={GROUND} width={20} height={10} fill={`url(#rain-reflect-${week})`} />
      <rect className="rain-reflect thin" x={x + 37} y={GROUND} width={6} height={10} fill={`url(#rain-reflect-${week})`} />
    </g>
  );
}

/** Ripples on the road: fixed spots, staggered timings. */
const RIPPLES = [
  { x: 96, d: 0 },
  { x: 268, d: 1.3 },
  { x: 452, d: 0.6 },
  { x: 618, d: 2.1 },
  { x: 802, d: 0.9 },
  { x: 846, d: 2.6 },
  { x: 1012, d: 1.7 },
  { x: 1150, d: 0.3 },
];

export function RainStreet() {
  return (
    <svg className="tw-street tw-rain-layer" viewBox={VIEWBOX} preserveAspectRatio="xMidYMax slice" focusable="false">
      <rect className="rain-wet" x={0} y={GROUND} width={1200} height={10} />
      <LampRain x={750} week="wd" />
      <LampRain x={760} week="we" />
      <g className="rain-ripples">
        {RIPPLES.map((r) => (
          <ellipse
            key={r.x}
            className="rain-ripple"
            cx={r.x}
            cy={GROUND + 4}
            rx={9}
            ry={1.8}
            style={{ animationDelay: `${r.d}s` }}
          />
        ))}
      </g>
    </svg>
  );
}

export function RainSky() {
  return (
    <div className="rain-sky" aria-hidden="true">
      <span className="rain-veil" />
      <span className="rain-fall far" />
      <span className="rain-fall near" />
    </div>
  );
}
