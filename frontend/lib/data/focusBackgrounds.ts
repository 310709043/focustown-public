/**
 * Six ambient backgrounds for the solo focus room. Each entry pairs a
 * gradient with a canvas/CSS effect rendered by
 * `components/focus/ambient/AmbientBackdrop.tsx`. Reference seeds the
 * solo room with `rain` (see `reference/screen-focus.jsx`).
 */

export type FocusBgId =
  | "cafe"
  | "rain"
  | "forest"
  | "space"
  | "lofi"
  | "fire";

export interface FocusBgOption {
  readonly id: FocusBgId;
  readonly emoji: string;
  /** Full-bleed background gradient applied to the scene root. */
  readonly gradient: string;
  readonly labels: { readonly "zh-TW": string; readonly en: string };
}

export const FOCUS_BG_OPTIONS: readonly FocusBgOption[] = [
  {
    id: "cafe",
    emoji: "☕",
    gradient:
      "linear-gradient(180deg, #3a2820 0%, #5a3a2a 60%, #7c4a2a 100%)",
    labels: { "zh-TW": "咖啡館", en: "Cafe" },
  },
  {
    id: "rain",
    emoji: "☂",
    gradient:
      "linear-gradient(180deg, #03061a 0%, #0a1845 60%, #1a2a6a 100%)",
    labels: { "zh-TW": "雨夜", en: "Rain" },
  },
  {
    id: "forest",
    emoji: "🌲",
    gradient:
      "linear-gradient(180deg, #0d2818 0%, #1f4a32 60%, #2d6e48 100%)",
    labels: { "zh-TW": "森林", en: "Forest" },
  },
  {
    id: "space",
    emoji: "🌌",
    gradient:
      "linear-gradient(180deg, #02020a 0%, #0a0524 60%, #2a1854 100%)",
    labels: { "zh-TW": "太空", en: "Space" },
  },
  {
    id: "lofi",
    emoji: "☁",
    gradient:
      "linear-gradient(180deg, #1a0d3d 0%, #2a1854 60%, #6e3a6e 100%)",
    labels: { "zh-TW": "lofi 房", en: "lofi room" },
  },
  {
    id: "fire",
    emoji: "🔥",
    gradient:
      "linear-gradient(180deg, #2a0d0a 0%, #5a2a1a 60%, #8a3a1a 100%)",
    labels: { "zh-TW": "火爐", en: "Fireplace" },
  },
];

/** Resolve an option by id; never returns null (clamps to `rain` default). */
export function findFocusBg(id: FocusBgId): FocusBgOption {
  return FOCUS_BG_OPTIONS.find((o) => o.id === id) ?? FOCUS_BG_OPTIONS[1];
}
