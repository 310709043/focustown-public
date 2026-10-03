import type { Profile } from "./rules";

/** A single human operator, never an automatically queued or simulated guest. */
export const COMPANION_ID = "admin:companion";
export const INVITE_MS = 60_000;
export const COMPANION_PROFILE: Profile = {
  nickname: "小鎮管理員",
  energy: 2,
  preference: "story",
  role: "admin",
};

export interface CompanionInvite {
  id: string;
  guestId: string;
  expiresAt: number;
}
