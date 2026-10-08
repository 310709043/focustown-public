/**
 * Live transport — the only code that talks to the matching backend.
 * Worth testing: server frames map to UI events (and malformed ones are
 * dropped), the server clock is translated to the local clock, the guest
 * token is fetched once and reused, frames queue until the socket opens,
 * heartbeats run, and closes trigger reconnects (4401 forgets the token).
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { HEARTBEAT_MS, OFFLINE_GRACE_MS } from "@/lib/lbt/constants";
import { createLiveTransport, mapServerFrame } from "@/lib/lbt/liveTransport";
import type { TransportEvent } from "@/lib/lbt/transport";

const NOW = Date.parse("2026-10-03T13:00:00Z");

describe("mapServerFrame", () => {
  const profile = { nickname: "阿樹", energy: 2, preference: "story" };

  test("matched converts the end time to the local clock", () => {
    const event = mapServerFrame(
      {
        type: "lbt.matched",
        me: { nickname: "小橘", energy: 1, preference: "listen" },
        partner: profile,
        // server clock is 10 minutes ahead of ours
        ends_at: "2026-10-03T13:17:00+00:00",
        server_now: "2026-10-03T13:10:00+00:00",
        grace_seconds: 60,
      },
      NOW,
    );

    expect(event).toMatchObject({ type: "matched", simulated: false, endsAt: NOW + 420_000 });
  });

  test.each([
    [{ type: "lbt.waiting" }, { type: "waiting" }],
    [
      { type: "lbt.message", id: "m1", from: "partner", text: "<i>hi</i>" },
      { type: "message", id: "m1", from: "partner", text: "<i>hi</i>" },
    ],
    [{ type: "lbt.typing" }, { type: "typing" }],
    [{ type: "lbt.extend_requested", by: "me" }, { type: "extendRequested", by: "me" }],
    [{ type: "lbt.ended", reason: "timeout" }, { type: "ended", reason: "timeout" }],
    [{ type: "lbt.idle" }, { type: "idle" }],
    [{ type: "lbt.error", code: "slow_down" }, { type: "error", code: "slow_down" }],
    [{ type: "lbt.error" }, { type: "error", code: "generic" }],
  ])("maps %j", (frame, expected) => {
    expect(mapServerFrame(frame, NOW)).toEqual(expected);
  });

  test.each([
    null,
    "text",
    { type: "lbt.unknown" },
    { type: "lbt.message", id: "m1", from: "someone", text: "x" },
    { type: "lbt.message", id: 1, from: "me", text: "x" },
    { type: "lbt.ended", reason: "exploded" },
    { type: "lbt.extend_requested", by: "admin" },
    { type: "lbt.matched", me: profile, partner: { ...profile, energy: 7 }, ends_at: "x", server_now: "y" },
    { type: "lbt.matched", me: profile, partner: profile, ends_at: "nope", server_now: "nope" },
  ])("drops malformed frame %j", (frame) => {
    expect(mapServerFrame(frame, NOW)).toBeNull();
  });
});

class FakeSocket {
  static instances: FakeSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: { code: number }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  closedWith: number | undefined;

  constructor(
    readonly url: string,
    readonly protocols?: string | string[],
  ) {
    FakeSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close(code?: number) {
    this.closedWith = code;
    this.readyState = 3;
  }
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
  serverClose(code: number) {
    this.readyState = 3;
    this.onclose?.({ code });
  }
  receive(frame: unknown) {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }
}

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

function okJson(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body } as Response;
}

describe("createLiveTransport", () => {
  let events: TransportEvent[];
  let fetchImpl: ReturnType<typeof vi.fn>;
  let storage: ReturnType<typeof memoryStorage>;
  let stop: (() => void) | undefined;

  const guestBody = { guest_id: "g_1", token: "tok-1", expires_at: "2026-10-04T13:00:00Z" };

  function make() {
    return createLiveTransport({
      apiBaseUrl: "http://api.test/",
      wsBaseUrl: "ws://api.test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      WebSocketImpl: FakeSocket,
      storage,
    });
  }

  async function started() {
    const transport = make();
    stop = transport.start((e) => events.push(e));
    await vi.waitFor(() => expect(FakeSocket.instances.length).toBeGreaterThan(0));
    return transport;
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "setInterval", "clearTimeout", "clearInterval", "Date"] });
    vi.setSystemTime(NOW);
    FakeSocket.instances = [];
    events = [];
    storage = memoryStorage();
    fetchImpl = vi.fn(async () => okJson(guestBody));
  });

  afterEach(() => {
    stop?.();
    stop = undefined;
    vi.useRealTimers();
  });

  test("connects with the guest token in the subprotocol", async () => {
    await started();

    expect([FakeSocket.instances[0].url, FakeSocket.instances[0].protocols]).toEqual([
      "ws://api.test/api/v1/lbt/ws",
      ["bearer.tok-1"],
    ]);
  });

  test("asks for a guest token once and caches it", async () => {
    await started();

    expect(storage.data.get("lbt.guest.v1")).toContain("tok-1");
  });

  test("reuses a cached token without calling the server", async () => {
    storage.setItem(
      "lbt.guest.v1",
      JSON.stringify({ token: "cached", expiresAt: NOW + 2 * 60 * 60 * 1000 }),
    );

    await started();

    expect([fetchImpl.mock.calls.length, FakeSocket.instances[0].protocols]).toEqual([
      0,
      ["bearer.cached"],
    ]);
  });

  test("a token about to expire is replaced", async () => {
    storage.setItem("lbt.guest.v1", JSON.stringify({ token: "old", expiresAt: NOW + 60_000 }));

    await started();

    expect(FakeSocket.instances[0].protocols).toEqual(["bearer.tok-1"]);
  });

  test("frames sent before the socket opens are delivered on open", async () => {
    const transport = await started();
    transport.join({ nickname: "小橘", energy: 1, preference: "listen", adult: true });

    FakeSocket.instances[0].open();

    expect(JSON.parse(FakeSocket.instances[0].sent[0])).toEqual({
      type: "join",
      profile: { nickname: "小橘", energy: 1, preference: "listen" },
      adult: true,
    });
  });

  test("leaving discards offline messages before reconnect", async () => {
    const transport = await started();
    transport.send("private unsent message");
    transport.extend();
    transport.leave();
    FakeSocket.instances[0].open();
    expect(FakeSocket.instances[0].sent.map((frame) => JSON.parse(frame))).toEqual([{ type: "leave" }]);
  });

  test("typing is dropped rather than queued while offline", async () => {
    const transport = await started();
    transport.typing();

    FakeSocket.instances[0].open();

    expect(FakeSocket.instances[0].sent).toEqual([]);
  });

  test("heartbeats are sent while open", async () => {
    await started();
    FakeSocket.instances[0].open();

    vi.advanceTimersByTime(HEARTBEAT_MS);

    expect(FakeSocket.instances[0].sent).toEqual([JSON.stringify({ type: "heartbeat" })]);
  });

  test("incoming frames reach the listener as events", async () => {
    await started();
    FakeSocket.instances[0].open();

    FakeSocket.instances[0].receive({ type: "lbt.typing" });

    expect(events.at(-1)).toEqual({ type: "typing" });
  });

  test("a non-JSON frame is ignored", async () => {
    await started();
    FakeSocket.instances[0].open();
    const before = events.length;

    FakeSocket.instances[0].onmessage?.({ data: "not json" });

    expect(events.length).toBe(before);
  });

  test("an unexpected close reports offline and reconnects", async () => {
    await started();
    FakeSocket.instances[0].open();

    FakeSocket.instances[0].serverClose(1006);
    await vi.advanceTimersByTimeAsync(OFFLINE_GRACE_MS); // reconnect fires at ~1s; offline only after the grace

    expect([events.some((e) => e.type === "connection" && e.state === "offline"), FakeSocket.instances.length]).toEqual([
      true,
      2,
    ]);
  });

  test("a 4401 close forgets the token and fetches a new one", async () => {
    await started();
    FakeSocket.instances[0].open();
    fetchImpl.mockResolvedValueOnce(okJson({ ...guestBody, token: "tok-2" }));

    FakeSocket.instances[0].serverClose(4401);
    await vi.advanceTimersByTimeAsync(1000);

    expect(FakeSocket.instances[1].protocols).toEqual(["bearer.tok-2"]);
  });

  test("coming back online reconnects at once instead of waiting out the backoff", async () => {
    await started();
    FakeSocket.instances[0].open();
    // Several failed tries: the next one would be many seconds away.
    for (let i = 0; i < 4; i += 1) {
      FakeSocket.instances[FakeSocket.instances.length - 1].serverClose(1006);
      await vi.advanceTimersByTimeAsync(16_000);
    }
    FakeSocket.instances[FakeSocket.instances.length - 1].serverClose(1006);
    const before = FakeSocket.instances.length;

    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(0);

    expect(FakeSocket.instances.length).toBe(before + 1);
  });

  test("an offline event retires a stale OPEN socket and online resumes with the same guest", async () => {
    await started();
    const old = FakeSocket.instances[0];
    old.open();
    window.dispatchEvent(new Event("offline"));
    expect(events.at(-1)).toEqual({ type: "connection", state: "offline" });
    expect(old.closedWith).toBe(1000);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(FakeSocket.instances).toHaveLength(1);
    expect(old.sent).toHaveLength(0);
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(0);
    expect(FakeSocket.instances).toHaveLength(2);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    FakeSocket.instances[1].open();
    old.serverClose(1006);
    expect(events.at(-1)).toEqual({ type: "connection", state: "open" });
  });

  test("returning to the tab reconnects a dropped socket, and leaves a live one alone", async () => {
    await started();
    FakeSocket.instances[0].open();
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);
    expect(FakeSocket.instances.length).toBe(1);

    FakeSocket.instances[0].serverClose(1006);
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);
    expect(FakeSocket.instances.length).toBe(2);
  });

  test("after stopping, waking the page does nothing", async () => {
    await started();
    FakeSocket.instances[0].open();
    stop?.();
    stop = undefined;

    window.dispatchEvent(new Event("online"));
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);

    expect(FakeSocket.instances.length).toBe(1);
  });

  test("stopping closes the socket and never reconnects", async () => {
    await started();
    FakeSocket.instances[0].open();

    stop?.();
    stop = undefined;
    await vi.advanceTimersByTimeAsync(30_000);

    expect([FakeSocket.instances[0].closedWith, FakeSocket.instances.length]).toEqual([1000, 1]);
  });

  test("a failed guest request reports offline and retries", async () => {
    fetchImpl.mockResolvedValueOnce(okJson({}, 503));
    const transport = make();
    stop = transport.start((e) => events.push(e));

    await vi.advanceTimersByTimeAsync(OFFLINE_GRACE_MS); // retry fires at ~1s; offline only after the grace

    expect([events.some((e) => e.type === "connection" && e.state === "offline"), FakeSocket.instances.length]).toEqual([
      true,
      1,
    ]);
  });

  test("status returns validated numbers", async () => {
    fetchImpl.mockResolvedValueOnce(okJson({ online: 12, waiting: 3, open: true, hours: "21:00-24:00" }));

    await expect(make().status()).resolves.toEqual({ online: 12, waiting: 3, open: true, hours: "21:00-24:00" });
  });

  test("a malformed status is treated as unknown, never guessed", async () => {
    fetchImpl.mockResolvedValueOnce(okJson({ online: "lots" }));

    await expect(make().status()).resolves.toBeNull();
  });

  test("an unreachable status endpoint is treated as unknown", async () => {
    fetchImpl.mockRejectedValueOnce(new Error("offline"));

    await expect(make().status()).resolves.toBeNull();
  });

  test("a report posts the reason with the guest token", async () => {
    fetchImpl
      .mockResolvedValueOnce(okJson(guestBody))
      .mockResolvedValueOnce(okJson({ id: "r1" }, 201));

    await make().report("harassment", "  rude  ");

    expect(fetchImpl.mock.calls[1]).toEqual([
      "http://api.test/api/v1/lbt/reports",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer tok-1" }),
        body: JSON.stringify({ reason: "harassment", note: "rude" }),
      }),
    ]);
  });

  test("a rejected report throws so the UI can say it failed", async () => {
    fetchImpl.mockResolvedValueOnce(okJson(guestBody)).mockResolvedValueOnce(okJson({}, 422));

    await expect(make().report("spam", "")).rejects.toThrow("report_422");
  });

  const offlineEvents = () => events.filter((e) => e.type === "connection" && (e as { state: string }).state === "offline");

  test("a reconnect within the grace never surfaces offline", async () => {
    await started();
    FakeSocket.instances[0].open();
    events.length = 0;

    FakeSocket.instances[0].serverClose(1006); // a transient drop
    await vi.advanceTimersByTimeAsync(1000); // reconnect backoff fires → socket[1]
    FakeSocket.instances[1].open(); // recovered within the grace
    await vi.advanceTimersByTimeAsync(OFFLINE_GRACE_MS); // past where offline would have fired

    expect(offlineEvents()).toEqual([]);
  });

  test("a drop that does not recover surfaces offline only after the grace", async () => {
    await started();
    FakeSocket.instances[0].open();
    events.length = 0;

    FakeSocket.instances[0].serverClose(1006);
    await vi.advanceTimersByTimeAsync(OFFLINE_GRACE_MS - 500);
    expect(offlineEvents()).toEqual([]); // still within grace: stays calm

    await vi.advanceTimersByTimeAsync(600); // cross the threshold
    expect(offlineEvents().length).toBe(1);
  });
});

describe("human companion protocol", () => {
  test("validates invitation expiry and converts server clock", () => {
    const frame={type:"lbt.companion_invite",id:"i",expires_at:"2026-10-03T13:11:00Z",server_now:"2026-10-03T13:10:00Z"};
    expect(mapServerFrame(frame,NOW)).toEqual({type:"companionInvite",id:"i",expiresAt:NOW+60000});
    expect(mapServerFrame({...frame,expires_at:"bad"},NOW)).toBeNull();
    expect(mapServerFrame({...frame,expires_at:frame.server_now},NOW)).toBeNull();
    expect(mapServerFrame({type:"lbt.companion_cleared",id:"i"},NOW)).toEqual({type:"companionCleared",id:"i"});
  });
  test("maps companion and legacy roles to a public companion role", () => {
    const p={nickname:"管理員",energy:2,preference:"story"};
    const f={type:"lbt.matched",me:p,partner:{...p,role:"admin"},ends_at:"2026-10-03T13:07:00Z",server_now:"2026-10-03T13:00:00Z"};
    expect(mapServerFrame(f,NOW)).toMatchObject({partner:{role:"companion"}});
    const event=mapServerFrame({...f,partner:{...p,role:"untrusted"}},NOW);
    if(event?.type!=="matched") throw new Error(); expect(event.partner).not.toHaveProperty("role");
  });
});
