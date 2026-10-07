/**
 * Artwork for the battery-family avatars (see lib/lbt/avatars.ts). Static
 * SVG built from constants only — never from user input — so the component
 * may inject it as markup. Each member is the home-page battery (same
 * outline, cap, inner block and face), always full so it never reads as an
 * energy level, in a colour that is none of the three energy colours; only
 * the accessory and expression change.
 */
import type { AvatarId } from "./avatars";

const FACE = "#334158";
const FRAME = "#aebdd1";
const CAP = "#7185a0";

const defs = (id: string, fill: string, fillLight: string) => `
  <defs>
    <radialGradient id="${id}-bg" cx="50%" cy="38%" r="70%">
      <stop offset="0" stop-color="#2f4068"/><stop offset=".65" stop-color="#1f2b48"/><stop offset="1" stop-color="#18213a"/>
    </radialGradient>
    <radialGradient id="${id}-glow" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="${fillLight}" stop-opacity=".35"/><stop offset="1" stop-color="${fillLight}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="${id}-fill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${fillLight}"/><stop offset="1" stop-color="${fill}"/>
    </linearGradient>
    <clipPath id="${id}-clip"><circle cx="48" cy="48" r="48"/></clipPath>
  </defs>`;

// body geometry
const B = { x: 30, y: 30, w: 36, h: 50, r: 8 };
const battery = (id: string) => `
  <ellipse cx="48" cy="56" rx="34" ry="30" fill="url(#${id}-glow)"/>
  <ellipse cx="48" cy="82.5" rx="17" ry="2.6" fill="#0d1322" opacity=".45"/>
  <rect x="41" y="${B.y - 5}" width="14" height="6" rx="2.4" fill="${CAP}"/>
  <rect x="${B.x}" y="${B.y}" width="${B.w}" height="${B.h}" rx="${B.r}" fill="#1b2540" stroke="${FRAME}" stroke-width="2.6"/>
  <rect x="${B.x + 4}" y="${B.y + 4}" width="${B.w - 8}" height="${B.h - 8}" rx="4.6" fill="url(#${id}-fill)"/>
  <rect x="${B.x + 6.5}" y="${B.y + 6.5}" width="4" height="${B.h - 22}" rx="2" fill="#ffffff" opacity=".28"/>`;

const eyesOpen = (y = 52) => `<ellipse cx="42.6" cy="${y}" rx="1.9" ry="2.8" fill="${FACE}"/><ellipse cx="53.4" cy="${y}" rx="1.9" ry="2.8" fill="${FACE}"/>`;
const eyesClosed = (y = 52) => `<path d="M40.2 ${y} q2.4 2.4 4.8 0 M51 ${y} q2.4 2.4 4.8 0" stroke="${FACE}" stroke-width="1.8" fill="none" stroke-linecap="round"/>`;
const eyesHappy = (y = 53) => `<path d="M40.2 ${y} q2.4 -3 4.8 0 M51 ${y} q2.4 -3 4.8 0" stroke="${FACE}" stroke-width="1.8" fill="none" stroke-linecap="round"/>`;
const smile = (y = 58.5) => `<path d="M45.6 ${y} q2.4 2.2 4.8 0" stroke="${FACE}" stroke-width="1.7" fill="none" stroke-linecap="round"/>`;
const flat = (y = 59) => `<path d="M46 ${y} h4" stroke="${FACE}" stroke-width="1.7" stroke-linecap="round"/>`;
const ooh = (y = 59.5) => `<ellipse cx="48" cy="${y}" rx="1.7" ry="2" fill="${FACE}"/>`;
const cheeks = (y = 56.5) => `<ellipse cx="39.2" cy="${y}" rx="2.6" ry="1.6" fill="#ff8f7e" opacity=".45"/><ellipse cx="56.8" cy="${y}" rx="2.6" ry="1.6" fill="#ff8f7e" opacity=".45"/>`;

const wrap = (id: string, body: string) => `<g clip-path="url(#${id}-clip)"><rect width="96" height="96" fill="url(#${id}-bg)"/><g transform="translate(48 52) scale(1.18) translate(-48 -52)">${body}</g></g>`;

const ART: Record<AvatarId, { fill: string; light: string; draw: (id: string) => string }> = {
  headphones: {
    fill: "#a99ad8",
    light: "#c9bff0",
    draw: (id) => battery(id) + eyesClosed() + smile() + cheeks() + `
      <path d="M27 54 C27 33 69 33 69 54" stroke="#f3eee4" stroke-width="3.4" fill="none" stroke-linecap="round"/>
      <rect x="22" y="48" width="9" height="15" rx="4" fill="#f8d779"/><rect x="65" y="48" width="9" height="15" rx="4" fill="#f8d779"/>
      <rect x="24" y="51" width="3" height="9" rx="1.5" fill="#e4bb4f"/><rect x="69" y="51" width="3" height="9" rx="1.5" fill="#e4bb4f"/>
      <text x="74" y="36" font-size="11" fill="#f8d779" font-family="sans-serif">♪</text>`,
  },
  blanket: {
    fill: "#8fb3e3",
    light: "#b8d0f2",
    draw: (id) => battery(id) + eyesClosed(50) + flat(55.5) + `
      <path d="M22 66 C26 58 36 60 48 60 C60 60 70 58 74 66 L76 88 L20 88Z" fill="#f2e6d2"/>
      <path d="M22 66 C26 58 36 60 48 60 C60 60 70 58 74 66" stroke="#e2d1b6" stroke-width="2" fill="none"/>
      <circle cx="33" cy="73" r="2" fill="#e6a7a0"/><circle cx="48" cy="78" r="2" fill="#e6a7a0"/><circle cx="63" cy="72" r="2" fill="#e6a7a0"/><circle cx="40" cy="84" r="2" fill="#9fc0dd"/><circle cx="57" cy="84" r="2" fill="#9fc0dd"/>
      <text x="64" y="30" font-size="10" font-weight="700" fill="#c9d6ee" font-family="sans-serif">z</text><text x="71" y="23" font-size="7" font-weight="700" fill="#c9d6ee" font-family="sans-serif">z</text>`,
  },
  coffee: {
    fill: "#d9c08f",
    light: "#efdcb5",
    draw: (id) => battery(id) + eyesOpen(51) + ooh(57.5) + cheeks(55.5) + `
      <path d="M58 66 h14 v8 a6 6 0 0 1 -6 6 h-2 a6 6 0 0 1 -6 -6z" fill="#f9f4eb"/>
      <path d="M72 68 h2.4 a3 3 0 0 1 0 6 H72" stroke="#f9f4eb" stroke-width="2" fill="none"/>
      <rect x="58" y="66" width="14" height="3" fill="#8a5a3c"/>
      <path d="M62 62 q-2 -3 0 -6 M67 62 q-2 -3 0 -6" stroke="#f9f4eb" stroke-width="1.5" fill="none" stroke-linecap="round" opacity=".8"/>
      <circle cx="58" cy="72" r="3" fill="url(#${id}-fill)" stroke="${FRAME}" stroke-width="1.2"/>`,
  },
  beanie: {
    fill: "#e6a3b5",
    light: "#f4c8d4",
    draw: (id) => battery(id) + eyesOpen(54) + smile(60) + cheeks(58.5) + `
      <path d="M27 40 C27 20 69 20 69 40 Z" fill="#5f79b8"/>
      <rect x="25" y="37" width="46" height="8" rx="4" fill="#4a64a3"/>
      <path d="M31 38.5 v5 M36 38.5 v5 M41 38.5 v5 M46 38.5 v5 M51 38.5 v5 M56 38.5 v5 M61 38.5 v5 M66 38.5 v5" stroke="#3b548f" stroke-width="1.3" stroke-linecap="round"/>
      <path d="M37 26 C40 30 41 34 41 37 M48 22 V37 M59 26 C56 30 55 34 55 37" stroke="#7690cf" stroke-width="1.6" fill="none" opacity=".7"/>
      <circle cx="48" cy="18.5" r="5.4" fill="#f3eee4"/>`,
  },
  glasses: {
    fill: "#9fcfd2",
    light: "#c6e6e8",
    draw: (id) => battery(id) + eyesOpen(51.5) + smile(59) + cheeks(57) + `
      <circle cx="42.6" cy="51.5" r="5.4" fill="#ffffff" fill-opacity=".18" stroke="#2c3550" stroke-width="1.8"/>
      <circle cx="53.4" cy="51.5" r="5.4" fill="#ffffff" fill-opacity=".18" stroke="#2c3550" stroke-width="1.8"/>
      <path d="M48 51 h0.01" stroke="#2c3550" stroke-width="1.8"/><path d="M46.6 50.4 q1.4 -1.2 2.8 0" stroke="#2c3550" stroke-width="1.6" fill="none"/>
      <path d="M22 70 h22 v13 h-22z" fill="#f3eee4"/><path d="M44 70 h22 v13 h-22z" fill="#e8dfcf"/><path d="M44 70 v13" stroke="#cbbfa9" stroke-width="1"/>
      <path d="M26 74 h14 M26 77.5 h12 M48 74 h14 M48 77.5 h11" stroke="#b9ae9b" stroke-width="1" stroke-linecap="round"/>`,
  },
  scarf: {
    fill: "#b7c98f",
    light: "#d6e3b6",
    draw: (id) => battery(id) + eyesHappy(50.5) + smile(55.5) + cheeks(54) + `
      <path d="M28 61 C36 66 60 66 68 61 L68 68 C60 72 36 72 28 68Z" fill="#d65f5f"/>
      <path d="M57 66 L60 84 L52 84 L51 68Z" fill="#c24f4f"/>
      <path d="M33 63.5 v5 M39 65 v5 M45 65.6 v5 M51 65.6 v5 M57 65 v5 M63 63.5 v5" stroke="#f3eee4" stroke-width="1.4" stroke-linecap="round" opacity=".55"/>
      <path d="M53 84 v3 M56 84 v3 M59 84 v3" stroke="#c24f4f" stroke-width="1.4" stroke-linecap="round"/>`,
  },
  umbrella: {
    fill: "#9db6dc",
    light: "#c3d4ee",
    draw: (id) => battery(id) + eyesOpen(54) + smile(60.5) + cheeks(58.5) + `
      <path d="M22 26 C24 10 72 10 74 26 C70 23 66 23 62 26 C58 23 54 23 50 26 C46 23 42 23 38 26 C34 23 30 23 26 26 C25 25.4 23.5 25.4 22 26Z" fill="#f8d779"/>
      <path d="M48 12 V26 M35.5 13.5 C38 18 38 22 38 26 M60.5 13.5 C58 18 58 22 58 26" stroke="#e4bb4f" stroke-width="1.2" fill="none"/>
      <path d="M48 8.5 V12" stroke="#c9d6ee" stroke-width="1.6" stroke-linecap="round"/>
      <path d="M48 26 V30" stroke="#c9d6ee" stroke-width="1.6"/>
      <path d="M16 40 l-2 5 M80 44 l-2 5 M14 62 l-2 5 M82 66 l-2 5" stroke="#9db6dc" stroke-width="1.6" stroke-linecap="round" opacity=".7"/>`,
  },
  cathood: {
    fill: "#c4a3d9",
    light: "#dcc6ec",
    draw: (id) => battery(id) + `
      <path d="M30.5 33 L32.5 17.5 Q33.2 15 35.6 16.6 L44 26Z" fill="#f3eee4"/><path d="M65.5 33 L63.5 17.5 Q62.8 15 60.4 16.6 L52 26Z" fill="#f3eee4"/>
      <path d="M33.6 27 L34.5 20 L39.8 24.6Z" fill="#f2a7a4"/><path d="M62.4 27 L61.5 20 L56.2 24.6Z" fill="#f2a7a4"/>
      <rect x="41" y="25" width="14" height="6" rx="2.4" fill="${CAP}"/>` + eyesOpen(52) + `
      <path d="M45.2 58 q1.4 1.6 2.8 0 q1.4 1.6 2.8 0" stroke="${FACE}" stroke-width="1.6" fill="none" stroke-linecap="round"/>` + cheeks(56.5) + `
      <path d="M33 56 h-7 M33 59 l-6.5 1.6 M63 56 h7 M63 59 l6.5 1.6" stroke="#f3eee4" stroke-width="1.1" stroke-linecap="round" opacity=".8"/>`,
  },
  flower: {
    fill: "#f0c9a0",
    light: "#f8e0c4",
    draw: (id) => battery(id) + eyesHappy(53) + `
      <path d="M45 57.5 q3 3.4 6 0" stroke="${FACE}" stroke-width="1.7" fill="#c9656b" stroke-linecap="round"/>` + cheeks(57) + `
      <path d="M58 26 q4 -4 6 -10" stroke="#6fa87e" stroke-width="2" fill="none" stroke-linecap="round"/>
      <path d="M61 22 q5 -1 6 3 q-5 1 -6 -3z" fill="#6fa87e"/>
      ${[0, 72, 144, 216, 288].map((r) => `<ellipse cx="64" cy="10" rx="3.6" ry="5.2" transform="rotate(${r} 64 15)" fill="#f6f0ff"/>`).join("")}
      <circle cx="64" cy="15" r="3" fill="#f8d779"/>`,
  },
  plug: {
    fill: "#a7d3b8",
    light: "#cbe8d6",
    draw: (id) => battery(id) + eyesOpen(52) + smile(58.5) + cheeks(56.5) + `
      <path d="M48 80 C48 88 30 86 24 80 C18 74 20 66 16 62" stroke="#c9d6ee" stroke-width="2.6" fill="none" stroke-linecap="round"/>
      <rect x="10" y="52" width="11" height="12" rx="2.6" fill="#f3eee4"/>
      <path d="M13 52 v-5 M18 52 v-5" stroke="#c9d6ee" stroke-width="2" stroke-linecap="round"/>
      <path d="M74 30 l-4 7 h4 l-3 7" stroke="#f8d779" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  },
};

/** The full SVG for one avatar; `uid` keeps gradient ids unique on the page. */
export function avatarSvg(avatar: AvatarId, uid: string): string {
  const art = ART[avatar];
  const id = `${avatar}-${uid.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return `<svg viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg" focusable="false">${defs(id, art.fill, art.light)}${wrap(id, art.draw(id))}</svg>`;
}
