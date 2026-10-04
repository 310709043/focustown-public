import type {
  Energy,
  EnergyId,
  Preference,
  ReplyId,
  ReportReason,
  TopicId,
} from "./types";

/** First conversation window, and each extension, in seconds. */
export const SESSION_SECONDS = 420;

/** Demo-mode pacing. These are timing choices, not network behaviour. */
export const WAIT_MS = 2200;
export const OPENER_DELAY_MS = 900;
export const REPLY_DELAY_MS = 1100;
export const EXTEND_ACCEPT_DELAY_MS = 1300;

export const NICKNAME_MAX = 12;
export const MESSAGE_MAX = 500;

export const ENERGIES: readonly Energy[] = [1, 2, 3];

export const ENERGY_ID: Record<Energy, EnergyId> = {
  1: "low",
  2: "mid",
  3: "high",
};

/** Battery fill height and colour for each social-battery level. */
export const ENERGY_VISUAL: Record<Energy, { fill: string; color: string }> = {
  1: { fill: "31%", color: "#f4b49d" },
  2: { fill: "61%", color: "#e9b976" },
  3: { fill: "91%", color: "#84b8a9" },
};

export const PREFERENCES: readonly Preference[] = ["casual", "listen", "story"];

/** The labelled demo partner. It is a script, never a real person. */
export const DEMO_PARTNER_ENERGY: Energy = 2;

export const TOPIC_IDS: readonly TopicId[] = [
  "moment",
  "pause",
  "song",
  "quiet",
  "story",
];

export const REPLY_IDS: readonly ReplyId[] = [
  "understand",
  "think",
  "thanks",
  "similar",
  "listening",
];

export const REPORT_REASONS: readonly ReportReason[] = [
  "harassment",
  "sexual",
  "minor",
  "spam",
  "self_harm",
  "other",
];
export const REPORT_NOTE_MAX = 500;

/** Live transport timings. The backend treats 45 s of silence as gone. */
export const HEARTBEAT_MS = 15_000;
export const STATUS_POLL_MS = 15_000;
export const TYPING_THROTTLE_MS = 3000;
export const PARTNER_TYPING_CLEAR_MS = 4000;
/** After this long in the waiting room, say plainly that it may take a while. */
export const LONG_WAIT_MS = 45_000;
