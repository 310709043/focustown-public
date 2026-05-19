/**
 * Six sky-themed ambient backdrops for the solo focus room.
 *
 * Aligned with the reference's `BG_OPTIONS` (reference/screen-focus.jsx) — a
 * platform-driven cycle moves through these in order with a 25 s crossfade.
 * No user-facing picker; the only override is the E2E test-mode lock via
 * `localStorage.focustown.ambient.lock`.
 */

export type FocusBgId =
  | "day"
  | "dawn"
  | "dusk_warm"
  | "dusk_cool"
  | "night"
  | "synth";

export interface FocusBgOption {
  readonly id: FocusBgId;
  readonly emoji: string;
  /** i18n key under the `focus.solo.ambient.labels` namespace. */
  readonly labelKey: FocusBgId;
  /** Full-bleed sky gradient applied to the matching `BackdropLayer`. */
  readonly skyGradient: string;
}

export const FOCUS_BG_OPTIONS: readonly FocusBgOption[] = [
  {
    id: "day",
    emoji: "☀",
    labelKey: "day",
    skyGradient:
      "linear-gradient(180deg,#0c4a6e 0%,#0ea5e9 35%,#7dd3fc 65%,#e0f2fe 100%)",
  },
  {
    id: "dawn",
    emoji: "🌅",
    labelKey: "dawn",
    skyGradient:
      "linear-gradient(180deg,#0d0428 0%,#4c1d95 25%,#9d174d 50%,#ea580c 75%,#fcd34d 100%)",
  },
  {
    id: "dusk_warm",
    emoji: "🌇",
    labelKey: "dusk_warm",
    skyGradient:
      "linear-gradient(180deg,#1e1040 0%,#7c2d12 30%,#c2410c 55%,#f97316 75%,#fcd34d 100%)",
  },
  {
    id: "dusk_cool",
    emoji: "🌆",
    labelKey: "dusk_cool",
    skyGradient:
      "linear-gradient(180deg,#1a0d3d 0%,#2a1854 60%,#6e3a6e 100%)",
  },
  {
    id: "night",
    emoji: "🌙",
    labelKey: "night",
    skyGradient:
      "linear-gradient(180deg,#020109 0%,#06011a 25%,#0c0330 50%,#160845 70%,#0d1040 100%)",
  },
  {
    id: "synth",
    emoji: "🌌",
    labelKey: "synth",
    skyGradient:
      "linear-gradient(180deg,#0a0524 0%,#3b1a6e 50%,#ec4899 100%)",
  },
];

export function findFocusBg(id: FocusBgId): FocusBgOption {
  return FOCUS_BG_OPTIONS.find((o) => o.id === id) ?? FOCUS_BG_OPTIONS[0];
}

export function focusBgIndex(id: FocusBgId): number {
  const i = FOCUS_BG_OPTIONS.findIndex((o) => o.id === id);
  return i < 0 ? 0 : i;
}
