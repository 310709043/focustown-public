/**
 * Uptime watch, every five minutes from the Worker's cron (UPTIME_CRON):
 * the website answers with the town page, and the chat Durable Object
 * answers a status call. The owner gets one Telegram/Discord alert when a
 * check starts failing, a reminder each hour it stays down, and one when it
 * recovers. State lives in D1 (lbt_uptime, migration 0008).
 *
 * This cannot report an outage of this Worker or of Cloudflare itself; an
 * external monitor on https://api.lowbatterytown.com/healthz covers that.
 */
export const UPTIME_CRON = "*/5 * * * *";
export const SITE_PROBE_URL = "https://www.lowbatterytown.com/zh-TW";
export const REMIND_MS = 60 * 60_000;
const TIMEOUT_MS = 10_000;

export type Probe = () => Promise<boolean>;

export interface Check {
  /** Shown to the owner, e.g. 網站. Also the D1 key. */
  name: string;
  host: string;
  probe: Probe;
}

interface Row {
  ok: number;
  since: string;
  alerted_at: string | null;
}

export interface UptimeDeps {
  db: D1Database;
  checks: Check[];
  now: number;
  notify: (text: string) => Promise<void>;
}

/** Two tries a few seconds apart, so one dropped request is not an outage. */
export async function twice(probe: Probe, pauseMs = 3_000): Promise<boolean> {
  const once = () => probe().catch(() => false);
  if (await once()) return true;
  await new Promise((r) => setTimeout(r, pauseMs));
  return once();
}

export function siteProbe(fetcher: typeof fetch = fetch): Probe {
  return async () => {
    const res = await fetcher(SITE_PROBE_URL, {
      headers: { "User-Agent": "LowBatteryTown-uptime" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return res.status === 200 && (await res.text()).includes("data-lbt-time");
  };
}

const minutes = (ms: number) => Math.max(1, Math.round(ms / 60_000));

/** Run every probe, record changes, and return the alerts that were sent. */
export async function runUptime({ db, checks, now, notify }: UptimeDeps): Promise<string[]> {
  const sent: string[] = [];
  const at = new Date(now).toISOString();
  for (const { name, host, probe } of checks) {
    const ok = await probe().catch(() => false);
    const prev = await db.prepare("SELECT ok, since, alerted_at FROM lbt_uptime WHERE name = ?")
      .bind(name).first<Row>();
    const wasOk = !prev || prev.ok === 1;
    let text: string | null = null;
    if (ok && !wasOk) {
      text = `✅ ${name}恢復了（中斷約 ${minutes(now - Date.parse(prev!.since))} 分鐘）`;
      await db.prepare("INSERT OR REPLACE INTO lbt_uptime (name, ok, since, alerted_at) VALUES (?, 1, ?, NULL)")
        .bind(name, at).run();
    } else if (!ok && wasOk) {
      text = `⚠️ ${name}連不上（${host}）`;
      await db.prepare("INSERT OR REPLACE INTO lbt_uptime (name, ok, since, alerted_at) VALUES (?, 0, ?, ?)")
        .bind(name, at, at).run();
    } else if (!ok && prev && now - Date.parse(prev.alerted_at ?? prev.since) >= REMIND_MS) {
      text = `⚠️ ${name}還是連不上（已約 ${minutes(now - Date.parse(prev.since))} 分鐘）`;
      await db.prepare("UPDATE lbt_uptime SET alerted_at = ? WHERE name = ?").bind(at, name).run();
    }
    if (text) {
      await notify(text).catch(() => undefined);
      sent.push(text);
    }
  }
  return sent;
}
