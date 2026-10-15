import type { AvatarId } from "@/lib/lbt/avatars";
import type { Face } from "@/lib/lbt/chatFaces";

import { SceneBattery } from "./SceneBattery";

/** The lamp's ring: r = 26, so a full window is this long. */
const RING = 2 * Math.PI * 26;

const PARTNER_CABLE = "M604 208 C 590 240, 630 248, 658 244";
const SELF_CABLE = "M740 208 C 752 240, 720 248, 686 244";

function Cable({ on, idle, plug, path }: { on: boolean; idle: string; plug: number; path: string }) {
  return (
    <g className="cable" data-on={on}>
      <g className="cable-off">
        <path d={idle} fill="none" strokeWidth="2.4" strokeDasharray="4 4" strokeLinecap="round" />
        <rect x={plug} y="249" width="10" height="9" rx="2" />
      </g>
      <g className="cable-on">
        <path d={path} fill="none" strokeWidth="8" strokeLinecap="round" opacity="0.2" />
        <path d={path} fill="none" strokeWidth="2.6" strokeLinecap="round" />
        <path className="cable-flow" d={path} fill="none" strokeWidth="2.6" strokeLinecap="round" strokeDasharray="3 17" />
      </g>
    </g>
  );
}

/**
 * The chat stage: a street lamp over a bench, the two batteries sitting on
 * it, plugged into the lamp's socket when they want 7 more minutes. The
 * ring round the lamp head is the time left. Colours and what moves follow
 * the town time in CSS (lbt.css, `.chat-stage`); drawn on a 1344 × 260
 * canvas whose centre is the lamp.
 */
export function BenchScene({
  partnerAvatar,
  selfAvatar,
  partnerFace,
  selfFace,
  partnerBeat,
  selfBeat,
  partnerPlugged,
  selfPlugged,
  left,
  lastMinute,
}: {
  partnerAvatar: AvatarId;
  selfAvatar: AvatarId;
  partnerFace: Face;
  selfFace: Face;
  partnerBeat: number;
  selfBeat: number;
  partnerPlugged: boolean;
  selfPlugged: boolean;
  /** Share of the window left, 0–1. */
  left: number;
  lastMinute: boolean;
}) {
  return (
    <svg className="bench-scene" viewBox="0 0 1344 260" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="lbt-bench-cone" cx="50%" cy="0%" r="100%">
          <stop offset="0" stopColor="#f8d779" stopOpacity="0.42" />
          <stop offset="1" stopColor="#f8d779" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="lbt-bench-pool" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#f8d779" stopOpacity="0.3" />
          <stop offset="1" stopColor="#f8d779" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="lbt-bench-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#fff2cf" stopOpacity="0.9" />
          <stop offset="1" stopColor="#fff2cf" stopOpacity="0" />
        </radialGradient>
        <mask id="lbt-bench-crescent">
          <rect x="1030" y="20" width="80" height="80" fill="#fff" />
          <circle cx="1082" cy="50" r="22" fill="#000" />
        </mask>
      </defs>

      <g className="bs-stars">
        <circle cx="140" cy="40" r="1.4" />
        <circle cx="260" cy="76" r="1" />
        <circle cx="420" cy="30" r="1.2" />
        <circle cx="900" cy="48" r="1.1" />
        <circle cx="1010" cy="90" r="1" />
        <circle cx="1270" cy="110" r="1.3" />
      </g>
      <g className="bs-moon">
        <circle cx="1070" cy="58" r="34" opacity="0.08" />
        <circle cx="1070" cy="58" r="24" mask="url(#lbt-bench-crescent)" />
      </g>
      <g className="bs-sun bs-sun-day">
        <circle className="bs-halo" cx="1060" cy="58" r="46" fill="url(#lbt-bench-glow)" />
        <circle cx="1060" cy="58" r="22" fill="#fff7df" />
      </g>
      <g className="bs-sun bs-sun-dusk">
        <circle className="bs-halo" cx="1188" cy="176" r="70" fill="#f8cf93" opacity="0.35" />
        <circle cx="1188" cy="176" r="30" fill="#f8cf93" />
      </g>
      <g className="bs-sun bs-sun-dawn">
        <circle className="bs-halo" cx="176" cy="186" r="62" fill="#f6d6a8" opacity="0.35" />
        <circle cx="176" cy="186" r="26" fill="#f6d6a8" />
      </g>
      <g className="bs-clouds">
        <g className="bs-drift">
          <ellipse cx="330" cy="54" rx="46" ry="11" />
          <ellipse cx="360" cy="46" rx="28" ry="10" />
        </g>
        <g className="bs-drift is-slow">
          <ellipse cx="930" cy="78" rx="54" ry="12" />
          <ellipse cx="900" cy="70" rx="26" ry="9" />
        </g>
      </g>
      <g className="bs-birds">
        <path d="M0 60 q4 -4 8 0 q4 -4 8 0" />
        <path d="M22 70 q3 -3 6 0 q3 -3 6 0" />
      </g>

      {/* the street runs on past both edges for windows wider than the canvas */}
      <g className="bs-buildings">
        <rect x="-420" y="128" width="130" height="132" />
        <rect x="-280" y="150" width="140" height="110" />
        <rect x="-130" y="118" width="120" height="142" />
        <rect x="0" y="140" width="120" height="120" />
        <rect x="130" y="100" width="96" height="160" />
        <rect x="236" y="156" width="140" height="104" />
        <rect x="930" y="122" width="118" height="138" />
        <rect x="1058" y="160" width="150" height="100" />
        <rect x="1218" y="110" width="126" height="150" />
        <rect x="1354" y="146" width="130" height="114" />
        <rect x="1494" y="120" width="110" height="140" />
        <rect x="1614" y="158" width="150" height="102" />
      </g>
      <g className="bs-windows">
        <rect x="-98" y="138" width="14" height="12" rx="2" />
        <rect x="150" y="118" width="14" height="12" rx="2" />
        <rect x="190" y="150" width="14" height="12" rx="2" />
        <rect x="262" y="178" width="14" height="12" rx="2" />
        <rect x="956" y="142" width="14" height="12" rx="2" />
        <rect x="1090" y="186" width="14" height="12" rx="2" />
        <rect x="1240" y="136" width="14" height="12" rx="2" />
        <rect x="1520" y="140" width="14" height="12" rx="2" />
      </g>

      <g className="bs-cone">
        <polygon points="654,118 690,118 812,250 532,250" fill="url(#lbt-bench-cone)" />
        <ellipse cx="672" cy="248" rx="160" ry="14" fill="url(#lbt-bench-pool)" />
      </g>
      <rect className="bs-pole" x="669" y="118" width="6" height="124" rx="3" />
      <path className="bs-shade" d="M655 106 h34 l-6 10 h-22 z" />
      <circle className="bs-ring-track" cx="672" cy="112" r="26" fill="none" strokeWidth="3" />
      <circle
        className={`bs-ring${lastMinute ? " is-urgent" : ""}`}
        cx="672"
        cy="112"
        r="26"
        fill="none"
        strokeWidth="3"
        strokeLinecap="round"
        transform="rotate(-90 672 112)"
        strokeDasharray={`${(RING * left).toFixed(1)} ${Math.ceil(RING)}`}
      />
      <circle className="bs-bulb" cx="672" cy="118" r="4.5" />
      <g className="bs-moths">
        <g className="bs-orbit">
          <circle cx="700" cy="116" r="1.8" opacity="0.8" />
        </g>
        <g className="bs-orbit is-slow">
          <circle cx="672" cy="142" r="1.5" opacity="0.6" />
        </g>
      </g>

      <rect className="bs-bench" x="572" y="214" width="200" height="9" rx="4" />
      <rect className="bs-bench-back" x="580" y="204" width="184" height="6" rx="3" />
      <rect className="bs-leg" x="586" y="223" width="6" height="24" />
      <rect className="bs-leg" x="752" y="223" width="6" height="24" />
      <rect className="bs-socket" x="654" y="234" width="36" height="18" rx="4" strokeWidth="1.5" />
      <rect className="bs-slot" data-on={partnerPlugged} x="661" y="240" width="5" height="7" rx="1.5" />
      <rect className="bs-slot" data-on={selfPlugged} x="678" y="240" width="5" height="7" rx="1.5" />

      <Cable on={partnerPlugged} idle="M604 208 C 592 244, 610 254, 628 254 L 640 254" plug={640} path={PARTNER_CABLE} />
      <Cable on={selfPlugged} idle="M740 208 C 752 244, 734 254, 716 254 L 704 254" plug={694} path={SELF_CABLE} />

      <SceneBattery key={`p${partnerBeat}`} avatar={partnerAvatar} face={partnerFace} side="lr" x={616} />
      <SceneBattery key={`s${selfBeat}`} avatar={selfAvatar} face={selfFace} side="ll" x={728} />
    </svg>
  );
}
