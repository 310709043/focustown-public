import type { TownObject } from "./townObject";
import { parseOpenHours } from "./rules";
import { DEFAULT_CONFIG, type TownConfig } from "./town";

export interface Env {
  TOWN: DurableObjectNamespace<TownObject>;
  DB: D1Database;
  /** Secret: signs guest tokens. */
  LBT_TOKEN_SECRET: string;
  /** Secret: bearer token for /api/v1/admin/lbt/*. Admin routes are off when unset. */
  ADMIN_TOKEN?: string;
  /** Comma-separated origins allowed to call the API from a browser. */
  ALLOWED_ORIGINS?: string;
  LBT_OPEN_HOURS?: string;
  LBT_TIMEZONE?: string;
  LBT_SESSION_SECONDS?: string;
  LBT_GUEST_TOKEN_TTL_HOURS?: string;
  LBT_REPORT_RETENTION_DAYS?: string;
  LBT_FEEDBACK_RETENTION_DAYS?: string;
  /** Apps Script web app URL (https://script.google.com/macros/s/…/exec); feedback is only stored when unset. */
  FEEDBACK_SHEET_URL?: string;
  /** Secret: shared with the Apps Script, which rejects requests without it. */
  FEEDBACK_SHEET_TOKEN?: string;
}

/** Abuse limits, same numbers as the FastAPI backend's settings. */
export const LIMITS = {
  guestPerIpPerHour: 30,
  wsConnectPerIpPerMin: 30,
  messagesPerGuestPerMin: 30,
  reportsPerGuestPerHour: 5,
  feedbackPerIpPerHour: 5,
} as const;

/** How often the Durable Object sweeps while anyone is waiting or chatting. */
export const SWEEP_MS = 3_000;
/** How often it wakes just to expire old state when nobody is around. */
export const IDLE_SWEEP_MS = 15 * 60_000;

function int(raw: string | undefined, fallback: number): number {
  const n = raw === undefined || raw === "" ? NaN : Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

/** A bad LBT_OPEN_HOURS throws, so a misconfiguration fails loudly instead of closing the town. */
export function townConfig(env: Env): TownConfig {
  const hours = (env.LBT_OPEN_HOURS ?? "").trim();
  return {
    ...DEFAULT_CONFIG,
    sessionMs: int(env.LBT_SESSION_SECONDS, DEFAULT_CONFIG.sessionMs / 1000) * 1000,
    openHours: parseOpenHours(hours),
    timeZone: env.LBT_TIMEZONE || DEFAULT_CONFIG.timeZone,
    hoursLabel: hours,
  };
}

export const tokenTtlHours = (env: Env) => int(env.LBT_GUEST_TOKEN_TTL_HOURS, 24);
export const retentionDays = (env: Env) => int(env.LBT_REPORT_RETENTION_DAYS, 180);
export const feedbackRetentionDays = (env: Env) => int(env.LBT_FEEDBACK_RETENTION_DAYS, 365);
