/**
 * "Someone is waiting" alerts to the owner's phone, so a lone visitor can be
 * met by a companion at any hour. Telegram (TELEGRAM_BOT_TOKEN +
 * TELEGRAM_CHAT_ID) and/or a Discord webhook (DISCORD_WEBHOOK_URL); with
 * neither set this does nothing.
 *
 * Privacy: the alert carries only the visitor's battery and chat intent and
 * how long they have waited — never a nickname, guest id, IP or message.
 */
import type { Preference } from "./rules";

type Energy = 1 | 2 | 3;

export interface WaitingAlert {
  energy: number;
  preference: Preference;
  waitedMs: number;
}

export interface AlertEnv {
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  DISCORD_WEBHOOK_URL?: string;
}

const ENERGY: Record<Energy, string> = { 1: "快沒電了", 2: "還有一點", 3: "想說說話" };
const PREFERENCE: Record<Preference, string> = { casual: "隨意聊聊", listen: "有人聽我說", story: "聽聽別人的故事" };
export const ADMIN_URL = "https://api.lowbatterytown.com/admin";
const TIMEOUT_MS = 5_000;

export function alertText(a: WaitingAlert): string {
  const seconds = Math.max(1, Math.round(a.waitedMs / 1000));
  return `🔋 有人在小鎮等人聊天：${ENERGY[a.energy as Energy] ?? ""}・${PREFERENCE[a.preference]}（已等 ${seconds} 秒）\n打開後台陪聊：${ADMIN_URL}`;
}

/** Only real Discord webhook URLs, so a typo or a hostile value never receives the alert. */
function discordUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const ok = url.protocol === "https:" && ["discord.com", "discordapp.com"].includes(url.hostname) &&
      url.pathname.startsWith("/api/webhooks/") && !url.username && !url.password;
    return ok ? url.toString() : null;
  } catch {
    return null;
  }
}

export function alertsConfigured(env: AlertEnv): boolean {
  return Boolean((env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) || discordUrl(env.DISCORD_WEBHOOK_URL));
}

/** Send to every configured channel; failures are swallowed (an alert must never break the sweep). */
export async function sendOwnerAlert(env: AlertEnv, alert: WaitingAlert, fetcher: typeof fetch = fetch): Promise<number> {
  const text = alertText(alert);
  const jobs: Promise<Response>[] = [];
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
    jobs.push(fetcher(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "error",
    }));
  }
  const discord = discordUrl(env.DISCORD_WEBHOOK_URL);
  if (discord) {
    jobs.push(fetcher(discord, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: text, allowed_mentions: { parse: [] } }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "error",
    }));
  }
  const results = await Promise.allSettled(jobs);
  return results.filter((r) => r.status === "fulfilled" && r.value.ok).length;
}
