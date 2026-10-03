/**
 * The Worker end to end inside workerd: real Durable Object, D1 and two
 * WebSocket clients speaking the protocol frontend/lib/lbt/liveTransport.ts
 * uses.
 */
import { SELF } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, test } from "vitest";

const BASE = "https://api.lowbatterytown.com";
const ORIGIN = "https://www.lowbatterytown.com";
const LISTEN = { nickname: "小橘", energy: 1, preference: "listen" };
const STORY = { nickname: "阿樹", energy: 2, preference: "story" };

async function guest(ip = "203.0.113.1"): Promise<string> {
  const res = await SELF.fetch(`${BASE}/api/v1/lbt/guest`, { method: "POST", headers: { "CF-Connecting-IP": ip } });
  expect(res.status).toBe(200);
  return ((await res.json()) as { token: string }).token;
}

interface Client {
  ws: WebSocket;
  frames: Record<string, unknown>[];
  send(frame: unknown): void;
  next(type: string): Promise<Record<string, unknown>>;
  closed: Promise<number>;
}

async function connect(token: string | null, ip = "203.0.113.1"): Promise<Client> {
  const res = await SELF.fetch(`${BASE}/api/v1/lbt/ws`, {
    headers: {
      Upgrade: "websocket",
      "CF-Connecting-IP": ip,
      ...(token ? { "Sec-WebSocket-Protocol": `bearer.${token}` } : {}),
    },
  });
  const ws = res.webSocket;
  if (!ws) throw new Error(`no websocket (${res.status})`);
  const frames: Record<string, unknown>[] = [];
  const waiters: { type: string; resolve: (f: Record<string, unknown>) => void }[] = [];
  let onClose: (code: number) => void = () => {};
  const closed = new Promise<number>((r) => (onClose = r));
  ws.accept();
  ws.addEventListener("message", (ev) => {
    const frame = JSON.parse(String(ev.data)) as Record<string, unknown>;
    frames.push(frame);
    const i = waiters.findIndex((w) => w.type === frame.type);
    if (i >= 0) waiters.splice(i, 1)[0]?.resolve(frame);
  });
  ws.addEventListener("close", (ev) => onClose(ev.code));
  return {
    ws,
    frames,
    closed,
    send: (frame) => ws.send(JSON.stringify(frame)),
    next(type) {
      const seen = frames.find((f) => f.type === type && !(f as { _taken?: true })._taken);
      if (seen) {
        (seen as { _taken?: true })._taken = true;
        return Promise.resolve(seen);
      }
      return new Promise((resolve) =>
        waiters.push({
          type,
          resolve: (f) => {
            (f as { _taken?: true })._taken = true;
            resolve(f);
          },
        }),
      );
    },
  };
}

describe("HTTP", () => {
  test("guest tokens are issued with an expiry", async () => {
    const res = await SELF.fetch(`${BASE}/api/v1/lbt/guest`, { method: "POST" });
    const body = (await res.json()) as Record<string, string>;
    expect([res.status, body.guest_id?.startsWith("g_"), typeof body.token, Date.parse(body.expires_at ?? "") > Date.now()]).toEqual([
      200,
      true,
      "string",
      true,
    ]);
  });

  test("guest tokens are rate limited per IP", async () => {
    const codes: number[] = [];
    for (let i = 0; i < 31; i++) {
      const res = await SELF.fetch(`${BASE}/api/v1/lbt/guest`, { method: "POST", headers: { "CF-Connecting-IP": "198.51.100.9" } });
      codes.push(res.status);
    }
    expect([codes.filter((c) => c === 200).length, codes.at(-1)]).toEqual([30, 429]);
  });

  test("status reports real counts", async () => {
    const res = await SELF.fetch(`${BASE}/api/v1/lbt/status`);
    expect(await res.json()).toEqual({ online: 0, waiting: 0, open: true, hours: "" });
  });

  test("CORS answers the site's origin only", async () => {
    const ok = await SELF.fetch(`${BASE}/api/v1/lbt/status`, { headers: { Origin: ORIGIN } });
    const other = await SELF.fetch(`${BASE}/api/v1/lbt/status`, { headers: { Origin: "https://evil.example" } });
    expect([ok.headers.get("Access-Control-Allow-Origin"), other.headers.get("Access-Control-Allow-Origin")]).toEqual([
      ORIGIN,
      null,
    ]);
  });

  test("reports need a guest token", async () => {
    const res = await SELF.fetch(`${BASE}/api/v1/lbt/reports`, { method: "POST", body: JSON.stringify({ reason: "spam" }) });
    expect(res.status).toBe(401);
  });

  test("admin routes need the admin token", async () => {
    const res = await SELF.fetch(`${BASE}/api/v1/admin/lbt/reports`, { headers: { Authorization: "Bearer nope" } });
    expect(res.status).toBe(401);
  });
});

describe("socket", () => {
  test("a bad token is closed with 4401", async () => {
    const c = await connect("not-a-token");
    expect(await c.closed).toBe(4401);
  });

  test("a fresh guest is told they are idle", async () => {
    const c = await connect(await guest());
    expect((await c.next("lbt.idle")).type).toBe("lbt.idle");
    c.ws.close(1000);
  });

  test("two guests pair, talk with contacts masked, and extend together", async () => {
    const a = await connect(await guest());
    const b = await connect(await guest());
    await a.next("lbt.idle");
    await b.next("lbt.idle");

    a.send({ type: "join", profile: LISTEN, adult: true });
    await a.next("lbt.waiting");
    b.send({ type: "join", profile: STORY, adult: true });
    const matched = await a.next("lbt.matched");
    await b.next("lbt.matched");
    expect(matched.partner).toEqual(STORY);

    a.send({ type: "message", text: "嗨，加我 0912-345-678" });
    const got = await b.next("lbt.message");
    expect([got.from, got.text]).toEqual(["partner", "嗨，加我 •••"]);

    a.send({ type: "extend" });
    expect((await b.next("lbt.extend_requested")).by).toBe("partner");
    b.send({ type: "extend" });
    const extended = await a.next("lbt.extended");
    expect(Date.parse(String(extended.ends_at)) - Date.parse(String(matched.ends_at))).toBe(420_000);

    const status = await SELF.fetch(`${BASE}/api/v1/lbt/status`);
    expect(((await status.json()) as { online: number }).online).toBeGreaterThanOrEqual(2);
    a.ws.close(1000);
    b.ws.close(1000);
  });

  test("a report ends the chat, lands in D1 and shows up for the admin", async () => {
    const tokenA = await guest();
    const a = await connect(tokenA);
    const b = await connect(await guest());
    a.send({ type: "join", profile: LISTEN, adult: true });
    b.send({ type: "join", profile: STORY, adult: true });
    await a.next("lbt.matched");
    b.send({ type: "message", text: "rude" });
    await a.next("lbt.message");

    const res = await SELF.fetch(`${BASE}/api/v1/lbt/reports`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "harassment", note: "不舒服" }),
    });
    expect(res.status).toBe(201);
    expect([(await a.next("lbt.ended")).reason, (await b.next("lbt.ended")).reason]).toEqual(["reported", "partner_left"]);

    const list = await SELF.fetch(`${BASE}/api/v1/admin/lbt/reports`, { headers: { Authorization: "Bearer admin-test-token" } });
    const items = ((await list.json()) as { items: { id: string; note: string; transcript: { from: string; text: string }[] }[] }).items;
    expect([items.length, items[0]?.note, items[0]?.transcript]).toEqual([1, "不舒服", [{ from: "reported", text: "rude", at: expect.any(String) }]]);

    const set = await SELF.fetch(`${BASE}/api/v1/admin/lbt/reports/${items[0]?.id}/status`, {
      method: "POST",
      headers: { Authorization: "Bearer admin-test-token" },
      body: JSON.stringify({ status: "reviewed" }),
    });
    const open = await SELF.fetch(`${BASE}/api/v1/admin/lbt/reports?status=open`, { headers: { Authorization: "Bearer admin-test-token" } });
    expect([set.status, ((await open.json()) as { items: unknown[] }).items.length]).toEqual([204, 0]);
    a.ws.close(1000);
    b.ws.close(1000);
  });

  test("invalid input comes back as lbt.error", async () => {
    const a = await connect(await guest());
    a.send({ type: "join", profile: LISTEN, adult: false });
    expect((await a.next("lbt.error")).code).toBe("age_required");
    a.ws.close(1000);
  });

  test("the daily cron purges reports past retention", async () => {
    await env.DB.prepare(
      "INSERT INTO lbt_reports (id, conversation_id, reporter_guest_id, reported_guest_id, reason, transcript, reporter_profile, reported_profile, created_at) VALUES ('old', 'c', 'g_a', 'g_b', 'spam', '[]', '{}', '{}', '2020-01-01T00:00:00.000Z')",
    ).run();
    const { default: worker } = await import("../src/index");
    await worker.scheduled({ cron: "17 19 * * *", scheduledTime: Date.now(), noRetry() {} } as ScheduledController, env, {} as ExecutionContext);
    const row = await env.DB.prepare("SELECT id FROM lbt_reports WHERE id = 'old'").first();
    expect(row).toBeNull();
  });
});
