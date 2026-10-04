import type { Profile } from "./rules";

/** A single human operator, never an automatically queued or simulated guest. */
export const COMPANION_ID = "admin:companion";
export const INVITE_MS = 60_000;
export const COMPANION_PROFILE: Profile = {
  nickname: "小辟穀",
  energy: 2,
  preference: "story",
  role: "admin",
};

/** Only these owner-approved names can be selected by an authenticated host. */
export function companionProfile(identity: unknown = "male"): Profile | null {
  if (identity !== "male" && identity !== "female") return null;
  return { ...COMPANION_PROFILE, nickname: identity === "male" ? "小辟穀" : "打辟穀" };
}

export function publicProfile(profile: Profile) {
  if (profile.role !== "admin") return { ...profile };
  return { ...profile, nickname: profile.nickname === "小鎮管理員" ? "小辟穀" : profile.nickname, role: "companion" };
}

export interface CompanionInvite {
  id: string;
  guestId: string;
  expiresAt: number;
  /** Snapshot at invitation time; optional for pre-upgrade invitations. */
  profile?: Profile;
}
