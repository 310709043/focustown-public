/** Shared types for the LowBatteryTown chat surface. */

export type LbtView = "home" | "waiting" | "chat" | "end";

/** `live` talks to the matching backend; `demo` is the labelled script. */
export type LbtMode = "live" | "demo";

/** Social battery: 1 = nearly out, 2 = a little left, 3 = up for a chat. */
export type Energy = 1 | 2 | 3;

export type EnergyId = "low" | "mid" | "high";

export type Preference = "casual" | "listen" | "story";

export type TopicId = "moment" | "pause" | "song" | "quiet" | "story";

export type ReplyId = "understand" | "think" | "thanks" | "similar" | "listening";

export type SystemCode =
  | "met"
  | "energyShown"
  | "extendAsked"
  | "extendPartnerAsked"
  | "extendAccepted";

export type EndReason =
  | "left"
  | "partner_left"
  | "timeout"
  | "partner_disconnected"
  | "reported";

export type ReportReason =
  | "harassment"
  | "sexual"
  | "minor"
  | "spam"
  | "self_harm"
  | "other";

/** Scripted partner lines in demo mode, localised by the UI. */
export type PartnerRef = { type: "opener" } | { type: "reply"; id: ReplyId };

export interface PeerProfile {
  nickname: string;
  energy: Energy;
  preference: Preference;
  role?: "admin";
}

export interface CompanionInvitation {
  id: string;
  expiresAt: number;
}

/**
 * One line in the conversation. Partner lines carry either real text (live)
 * or a script reference (demo). All text is rendered as React text only.
 */
export type ChatLine =
  | { id: string; kind: "system"; code: SystemCode }
  | { id: string; kind: "me"; text: string }
  | { id: string; kind: "partner"; text?: string; ref?: PartnerRef };

export type LbtModal =
  | { type: "about" }
  | { type: "support" }
  | { type: "report" }
  | { type: "feedback" }
  | { type: "timeUp" };

export type ConnectionState = "idle" | "connecting" | "open" | "offline";

/** Town status shown on the home and waiting screens. Never invented. */
export interface TownStatus {
  online: number;
  waiting: number;
  open: boolean;
  hours: string;
}
