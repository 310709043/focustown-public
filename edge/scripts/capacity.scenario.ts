import { SELF } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { expect, test } from "vitest";

const BASE = "https://api.lowbatterytown.com";
type Frame = { type: string; text?: string; code?: string };

async function client(index: number) {
  // SELF stays inside local workerd. Distinct documentation-only IPs represent
  // independent guests, not a bypass of production NAT limits.
  const ip = `2001:db8::${(index + 1).toString(16)}`;
  const guest = await SELF.fetch(`${BASE}/api/v1/lbt/guest`, { method: "POST", headers: { "CF-Connecting-IP": ip } });
  expect(guest.status).toBe(200);
  const { token } = await guest.json() as { token: string };
  const result = await SELF.fetch(`${BASE}/api/v1/lbt/ws`, { headers: {
    Upgrade: "websocket", "CF-Connecting-IP": ip, "Sec-WebSocket-Protocol": `bearer.${token}`,
    Origin: "https://www.lowbatterytown.com",
  } });
  if (!result.webSocket) throw new Error(`WebSocket upgrade failed: ${result.status}`);
  const ws = result.webSocket;
  const queue: Frame[] = [];
  const waiters = new Map<string, { resolve: (frame: Frame) => void; reject: (error: Error) => void }>();
  ws.accept();
  ws.addEventListener("message", (event) => {
    const frame = JSON.parse(String(event.data)) as Frame;
    if (frame.type === "lbt.error") {
      for (const waiter of waiters.values()) waiter.reject(new Error(`Protocol error: ${frame.code}`));
      waiters.clear();
    }
    const waiter = waiters.get(frame.type);
    if (waiter) { waiters.delete(frame.type); waiter.resolve(frame); }
    else queue.push(frame);
  });
  return {
    ws,
    send: (frame: unknown) => ws.send(JSON.stringify(frame)),
    next(type: string): Promise<Frame> {
      const found = queue.findIndex(frame => frame.type === type);
      if (found >= 0) return Promise.resolve(queue.splice(found, 1)[0]!);
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => { waiters.delete(type); reject(new Error(`Timed out waiting for ${type}`)); }, 20_000);
        waiters.set(type, {
          resolve: frame => { clearTimeout(timeout); resolve(frame); },
          reject: error => { clearTimeout(timeout); reject(error); },
        });
      });
    },
  };
}

function percentile(values: number[], percent: number) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * percent) - 1)];
}

const count = Number((env as unknown as { CAPACITY_GUESTS: string }).CAPACITY_GUESTS);
  test(`local workerd: ${count} concurrent guests pair and exchange messages`, async () => {
    const clients: Awaited<ReturnType<typeof client>>[] = [];
    const started = Date.now();
    const heartbeat = setInterval(() => {
      for (const connection of clients) {
        if (connection.ws.readyState === WebSocket.OPEN) connection.send({ type: "heartbeat" });
      }
    }, 10_000);
    try {
      // Batches bound the test harness's request concurrency without reducing
      // the number of simultaneously open sockets.
      for (let offset = 0; offset < count; offset += 20) {
        const batch = await Promise.all(Array.from({ length: Math.min(20, count - offset) }, async (_, i) => {
          const connection = await client(offset + i);
          clients.push(connection);
          await connection.next("lbt.idle");
          return connection;
        }));
        await Promise.all(batch.map(async connection => {
          const matched = connection.next("lbt.matched");
          connection.send({ type: "join", adult: true, profile: { nickname: "容量測試", energy: 1, preference: "casual" } });
          await matched;
        }));
      }
      const status = await (await SELF.fetch(`${BASE}/api/v1/lbt/status`)).json() as { online: number; waiting: number };
      // Idle recent visitors from the previous scenario can remain in status
      // until the offline grace expires; these are not active test pairs.
      expect(status.waiting).toBe(0);
      expect(status.online).toBeGreaterThanOrEqual(count);
      const setupMs = Date.now() - started;
      const latencies = await Promise.all(clients.map(async (connection, index) => {
        const received = connection.next("lbt.message");
        const sent = Date.now();
        connection.send({ type: "message", text: `load test ${index}` });
        const frame = await received;
        expect(frame.text).toMatch(/^load test /);
        return Date.now() - sent;
      }));
      console.log(JSON.stringify({ scenario: "local workerd only", guests: count, conversations: count / 2,
        setup_ms: setupMs, messages: latencies.length,
        message_p50_ms: percentile(latencies, 0.5), message_p95_ms: percentile(latencies, 0.95) }));
      await Promise.all(clients.map(async connection => {
        const ended = connection.next("lbt.ended");
        connection.send({ type: "leave" });
        await ended;
      }));
    } finally {
      clearInterval(heartbeat);
      for (const connection of clients) connection.ws.close(1000);
    }
  });
