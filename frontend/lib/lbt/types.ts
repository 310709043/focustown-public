/** Shared types for the LowBatteryTown simulated-chat surface. */

export type LbtView = "home" | "waiting" | "chat" | "end";

/** Social battery: 1 = nearly out, 2 = a little left, 3 = up for a chat. */
export type Energy = 1 | 2 | 3;

export type EnergyId = "low" | "mid" | "high";

export type Preference = "casual" | "listen" | "story";

export type TopicId = "moment" | "pause" | "song" | "quiet" | "story";

export type ReplyId = "understand" | "think" | "thanks" | "similar" | "listening";

export type SystemCode = "met" | "energyShown" | "extendAsked" | "extendAccepted";

export type PartnerRef =
  | { type: "opener" }
  | { type: "reply"; id: ReplyId };

/**
 * One line in the simulated conversation. Partner and system lines carry a
 * message reference rather than text so the UI can localise them; only the
 * user's own words are stored verbatim (and rendered as plain text).
 */
export type ChatLine =
  | { id: number; kind: "system"; code: SystemCode }
  | { id: number; kind: "me"; text: string }
  | { id: number; kind: "partner"; ref: PartnerRef };

export type NewChatLine =
  | { kind: "system"; code: SystemCode }
  | { kind: "me"; text: string }
  | { kind: "partner"; ref: PartnerRef };

export type LbtModal =
  | { type: "about" }
  | { type: "support" }
  | { type: "report" }
  | { type: "timeUp" };

export type SupportAmount = 60 | 150 | 300;
