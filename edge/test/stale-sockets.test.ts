import { runInDurableObject, SELF } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, test } from "vitest";

/**
 * A guest may hold two sockets (two tabs). A socket whose client went away
 * without a close (a phone asleep, Wi-Fi dropped) must not count towards
 * that cap once it has been silent past offlineAfter, or the visitor is
 * stuck on "reconnecting".
 */
const BASE = "https://api.lowbatterytown.com";

async function token(ip: string) {
  const res = await SELF.fetch(`${BASE}/api/v1/lbt/guest`, { method: "POST", headers: { "CF-Connecting-IP": ip } });
  return ((await res.json()) as { token: string }).token;
}

async function open(tok: string, ip: string) {
  const res = await SELF.fetch(`${BASE}/api/v1/lbt/ws`, {
    headers: { Upgrade: "websocket", "Sec-WebSocket-Protocol": `bearer.${tok}`, "CF-Connecting-IP": ip },
  });
  const ws = res.webSocket!;
  const closed = new Promise<number>((resolve) => ws.addEventListener("close", (e) => resolve(e.code)));
  ws.accept();
  return { ws, closed };
}

const settle = () => new Promise((r) => setTimeout(r, 50));

describe("per-guest socket cap", () => {
  test("a third live tab is refused", async () => {
    const ip = "192.0.2.80";
    const tok = await token(ip);
    await open(tok, ip);
    await open(tok, ip);
    const third = await open(tok, ip);
    expect(await third.closed).toBe(4429);
  });

  test("silent sockets are closed to make room for the visitor's next connection", async () => {
    const ip = "192.0.2.81";
    const tok = await token(ip);
    const a = await open(tok, ip);
    const b = await open(tok, ip);
    await settle();
    // Both clients vanished long ago without closing.
    const stub = env.TOWN.get(env.TOWN.idFromName("town"));
    await runInDurableObject(stub, async (_instance, state) => {
      for (const ws of state.getWebSockets()) {
        const meta = ws.deserializeAttachment() as { seen: number } | null;
        if (meta) ws.serializeAttachment({ seen: 0 });
      }
    });
    const c = await open(tok, ip);
    expect(await a.closed).toBe(4408);
    expect(await b.closed).toBe(4408);
    let cClosed = false;
    void c.closed.then(() => (cClosed = true));
    await settle();
    expect(cClosed).toBe(false);
    c.ws.close(1000);
  });
});
