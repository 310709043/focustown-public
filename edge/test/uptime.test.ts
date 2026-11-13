import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, test } from "vitest";
import { REMIND_MS, runUptime, siteProbe, twice, type Check } from "../src/uptime";

/**
 * Uptime watch: one alert when a check starts failing, an hourly reminder
 * while it stays down, one when it recovers, and nothing while all is well.
 */
const T0 = Date.UTC(2026, 10, 13, 12, 0);
let up: boolean;
let sent: string[];

const site: Check = { name: "網站", host: "www.lowbatterytown.com", probe: async () => up };
const run = (now: number, checks: Check[] = [site]) =>
  runUptime({ db: env.DB, checks, now, notify: async (t) => void sent.push(t) });

beforeEach(async () => {
  up = true;
  sent = [];
  await env.DB.prepare("DELETE FROM lbt_uptime").run();
});

describe("runUptime", () => {
  test("stays quiet while the check passes", async () => {
    await run(T0);
    await run(T0 + 5 * 60_000);
    expect(sent).toEqual([]);
  });

  test("alerts once when a check starts failing, naming the host", async () => {
    up = false;
    await run(T0);
    await run(T0 + 5 * 60_000);
    expect(sent).toEqual(["⚠️ 網站連不上（www.lowbatterytown.com）"]);
  });

  test("reminds every hour while still down", async () => {
    up = false;
    await run(T0);
    await run(T0 + REMIND_MS - 60_000);
    await run(T0 + REMIND_MS);
    expect(sent).toHaveLength(2);
    expect(sent[1]).toBe("⚠️ 網站還是連不上（已約 60 分鐘）");
  });

  test("reports recovery with the outage length, then stays quiet", async () => {
    up = false;
    await run(T0);
    up = true;
    await run(T0 + 15 * 60_000);
    await run(T0 + 20 * 60_000);
    expect(sent).toEqual(["⚠️ 網站連不上（www.lowbatterytown.com）", "✅ 網站恢復了（中斷約 15 分鐘）"]);
  });

  test("a probe that throws counts as down and the others still run", async () => {
    const broken: Check = { name: "聊天伺服器", host: "api.lowbatterytown.com", probe: async () => { throw new Error("x"); } };
    await run(T0, [broken, site]);
    expect(sent).toEqual(["⚠️ 聊天伺服器連不上（api.lowbatterytown.com）"]);
  });

  test("a failing notifier does not stop the state from being recorded", async () => {
    up = false;
    await runUptime({ db: env.DB, checks: [site], now: T0, notify: async () => { throw new Error("offline"); } });
    const row = await env.DB.prepare("SELECT ok FROM lbt_uptime WHERE name = ?").bind("網站").first<{ ok: number }>();
    expect(row?.ok).toBe(0);
  });
});

describe("probes", () => {
  test("twice retries one failure", async () => {
    let calls = 0;
    expect(await twice(async () => ++calls > 1, 0)).toBe(true);
    expect(calls).toBe(2);
  });

  test("twice gives up after two failures", async () => {
    expect(await twice(async () => { throw new Error("down"); }, 0)).toBe(false);
  });

  test("the site probe wants a 200 with the town page", async () => {
    const page = (status: number, body: string) => (async () => new Response(body, { status })) as unknown as typeof fetch;
    expect(await siteProbe(page(200, '<html data-lbt-time="night">'))()).toBe(true);
    expect(await siteProbe(page(200, "<html>maintenance</html>"))()).toBe(false);
    expect(await siteProbe(page(502, 'data-lbt-time'))()).toBe(false);
  });
});
