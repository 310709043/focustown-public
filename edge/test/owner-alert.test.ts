import { beforeEach, describe, expect, test } from "vitest";
import { COMPANION_ID } from "../src/companion";
import { alertText, alertsConfigured, sendOwnerAlert } from "../src/ownerAlert";
import { MemoryKV, TownStore } from "../src/store";
import { DEFAULT_CONFIG, Town } from "../src/town";

/**
 * "Someone is waiting" alerts: after alertAfterMs unpaired, once per visitor,
 * at most once per alertGapMs, not while the companion console is on duty,
 * and never carrying a nickname or id.
 */
const T0 = Date.UTC(2026, 9, 7, 14, 0);
const LISTEN = { nickname: "小橘", energy: 1, preference: "listen" };
const STORY = { nickname: "阿樹", energy: 2, preference: "story" };

let now: number;
let store: TownStore;
let town: Town;
let alerts: { energy: number; preference: string; waitedMs: number }[];

beforeEach(() => {
  now = T0;
  alerts = [];
  store = new TownStore(new MemoryKV());
  let seq = 0;
  town = new Town({
    store,
    send: () => undefined,
    now: () => now,
    newId: () => `id-${++seq}`,
    config: DEFAULT_CONFIG,
    onLonelyWaiter: async (a) => void alerts.push(a),
  });
});

async function tick(ms: number, ...alive: string[]) {
  now += ms;
  for (const g of alive) await town.heartbeat(g);
  await town.sweep();
}

describe("owner alerts", () => {
  test("a lone visitor triggers one alert after 20 s, with battery and intent only", async () => {
    await town.join("g_a", LISTEN, true);
    await tick(10_000, "g_a");
    expect(alerts).toEqual([]);
    await tick(11_000, "g_a");
    expect(alerts).toEqual([{ energy: 1, preference: "listen", waitedMs: 21_000 }]);
    await tick(200_000, "g_a");
    expect(alerts).toHaveLength(1);
    expect(JSON.stringify(alerts)).not.toContain("小橘");
  });

  test("a second lonely visitor waits for the gap", async () => {
    await town.join("g_a", LISTEN, true);
    await tick(21_000, "g_a");
    await town.cancel("g_a");
    await town.join("g_b", STORY, true);
    await tick(21_000, "g_b");
    expect(alerts).toHaveLength(1);
    await tick(100_000, "g_b");
    expect(alerts.map((a) => a.preference)).toEqual(["listen", "story"]);
  });

  test("no alert when two visitors pair", async () => {
    await town.join("g_a", LISTEN, true);
    await town.join("g_b", STORY, true);
    await tick(30_000, "g_a", "g_b");
    expect(alerts).toEqual([]);
  });

  test("no alert while the companion console is on duty", async () => {
    await town.heartbeat(COMPANION_ID);
    await town.join("g_a", LISTEN, true);
    await tick(21_000, "g_a", COMPANION_ID);
    expect(alerts).toEqual([]);
  });
});

describe("alert delivery", () => {
  const alert = { energy: 1, preference: "listen" as const, waitedMs: 21_000 };

  test("text names the battery, intent and wait, and links the console", () => {
    expect(alertText(alert)).toContain("快沒電了・有人聽我說（已等 21 秒）");
    expect(alertText(alert)).toContain("https://api.lowbatterytown.com/admin");
  });

  test("nothing is configured without secrets, and a non-Discord URL is ignored", () => {
    expect(alertsConfigured({})).toBe(false);
    expect(alertsConfigured({ TELEGRAM_BOT_TOKEN: "t" })).toBe(false);
    expect(alertsConfigured({ DISCORD_WEBHOOK_URL: "https://evil.example/api/webhooks/1/x" })).toBe(false);
    expect(alertsConfigured({ TELEGRAM_BOT_TOKEN: "t", TELEGRAM_CHAT_ID: "1" })).toBe(true);
  });

  test("posts to Telegram and Discord, and survives a failing channel", async () => {
    const calls: string[] = [];
    const fake = (async (url: string | URL | Request) => {
      calls.push(String(url));
      if (String(url).includes("discord")) throw new Error("down");
      return Response.json({ ok: true });
    }) as typeof fetch;
    const ok = await sendOwnerAlert(
      { TELEGRAM_BOT_TOKEN: "123:abc", TELEGRAM_CHAT_ID: "42", DISCORD_WEBHOOK_URL: "https://discord.com/api/webhooks/1/x" },
      alert,
      fake,
    );
    expect(ok).toBe(1);
    expect(calls).toEqual(["https://api.telegram.org/bot123:abc/sendMessage", "https://discord.com/api/webhooks/1/x"]);
  });
});
