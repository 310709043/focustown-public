/**
 * 6 NPC / user statuses. Each status is a (emoji + Chinese label + colour) tuple.
 * Used by Pedestrians + CarsLane to render the head-bubble; later swappable
 * with real presence data from a WebSocket subscription.
 */

export type StatusCode = "focus" | "break" | "deep" | "read" | "create" | "afk";

export type Status = {
  code: StatusCode;
  emoji: string;
  label: string;
  color: string;
};

export const STATUSES: Status[] = [
  { code: "focus",  emoji: "🍅", label: "專注中",  color: "var(--teal)" },
  { code: "break",  emoji: "☕", label: "短休息",  color: "var(--amber)" },
  { code: "deep",   emoji: "🔮", label: "深度",    color: "var(--a1)" },
  { code: "read",   emoji: "📚", label: "讀書中",  color: "var(--pink)" },
  { code: "create", emoji: "🎨", label: "創作中",  color: "#fb923c" },
  { code: "afk",    emoji: "🚶", label: "離開中",  color: "#94a3b8" },
];

export function statusByCode(code: StatusCode): Status {
  return STATUSES.find((s) => s.code === code) ?? STATUSES[0];
}

export function pickRandomStatus(): Status {
  return STATUSES[Math.floor(Math.random() * STATUSES.length)];
}
