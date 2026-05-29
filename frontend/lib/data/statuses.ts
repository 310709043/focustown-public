/**
 * 6 NPC / user statuses. Each status is a (code + emoji + colour) tuple.
 * Used by Pedestrians + CarsLane to render the head-bubble; later swappable
 * with real presence data from a WebSocket subscription.
 *
 * The human-readable label is NOT stored here — it is resolved at render
 * time from the `town.scene.statuses.{code}` next-intl namespace so the
 * bubble follows the active locale instead of leaking the seed's Chinese.
 */

export type StatusCode = "focus" | "break" | "deep" | "read" | "create" | "afk";

export type Status = {
  code: StatusCode;
  emoji: string;
  color: string;
};

export const STATUSES: Status[] = [
  { code: "focus",  emoji: "🍅", color: "var(--teal)" },
  { code: "break",  emoji: "☕", color: "var(--amber)" },
  { code: "deep",   emoji: "🔮", color: "var(--a1)" },
  { code: "read",   emoji: "📚", color: "var(--pink)" },
  { code: "create", emoji: "🎨", color: "#fb923c" },
  { code: "afk",    emoji: "🚶", color: "#94a3b8" },
];

export function statusByCode(code: StatusCode): Status {
  return STATUSES.find((s) => s.code === code) ?? STATUSES[0];
}

export function pickRandomStatus(): Status {
  return STATUSES[Math.floor(Math.random() * STATUSES.length)];
}
