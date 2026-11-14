/**
 * Device unlocks: a redeemed code keeps only the token and what it unlocks,
 * errors map to plain outcomes, and the once-a-day check drops a revoked
 * code (a refund) but keeps the unlock when the town cannot be reached.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";

import { useUnlocks } from "@/lib/lbt/unlocks";

const NOW = Date.UTC(2026, 9, 15, 12);
const reply = (status: number, body: unknown) => ({ ok: status < 300, status, json: async () => body }) as Response;

beforeEach(() => {
  window.localStorage.clear();
  useUnlocks.setState({ items: [], loaded: false, expiresAt: null });
});

describe("redeem", () => {
  test("a good code unlocks the pond and is remembered on this device", async () => {
    const fetcher = vi.fn(async () => reply(200, { token: "u1.a.b", items: ["koi-pond"] }));
    expect(await useUnlocks.getState().redeem("http://api", "abcd-efgh-jkmn", fetcher, NOW)).toBe("ok");
    expect(useUnlocks.getState().items).toEqual(["koi-pond"]);
    expect(JSON.parse(window.localStorage.getItem("lbt-unlock")!)).toEqual({
      entries: [{ token: "u1.a.b", items: ["koi-pond"], expiresAt: null }],
      checkedAt: NOW,
    });
    expect(fetcher).toHaveBeenCalledWith("http://api/api/v1/lbt/unlock", expect.objectContaining({ method: "POST", body: '{"code":"abcd-efgh-jkmn"}' }));
  });

  test.each([
    [reply(422, { error: { code: "invalid_code" } }), "invalid_code"],
    [reply(409, { error: { code: "code_used_up" } }), "code_used_up"],
    [reply(422, { error: { code: "code_expired" } }), "code_expired"],
    [reply(429, {}), "too_many"],
  ] as const)("a refusal becomes a plain outcome (%#)", async (res, outcome) => {
    expect(await useUnlocks.getState().redeem("http://api", "x", vi.fn(async () => res), NOW)).toBe(outcome);
    expect(useUnlocks.getState().items).toEqual([]);
  });

  test("a second code adds its look and keeps the first", async () => {
    await useUnlocks.getState().redeem("http://api", "a", vi.fn(async () => reply(200, { token: "u1.pond", items: ["koi-pond"] })), NOW);
    await useUnlocks.getState().redeem("http://api", "b", vi.fn(async () => reply(200, { token: "u1.rain", items: ["rain-town"] })), NOW);
    expect(useUnlocks.getState().items).toEqual(["koi-pond", "rain-town"]);
    const saved = JSON.parse(window.localStorage.getItem("lbt-unlock")!) as { entries: { token: string }[] };
    expect(saved.entries.map((e) => e.token)).toEqual(["u1.pond", "u1.rain"]);
  });

  test("redeeming the same code again does not duplicate it", async () => {
    const fetcher = vi.fn(async () => reply(200, { token: "u1.pond", items: ["koi-pond"] }));
    await useUnlocks.getState().redeem("http://api", "a", fetcher, NOW);
    await useUnlocks.getState().redeem("http://api", "a", fetcher, NOW);
    expect((JSON.parse(window.localStorage.getItem("lbt-unlock")!) as { entries: unknown[] }).entries).toHaveLength(1);
  });

  test("no connection says so", async () => {
    expect(await useUnlocks.getState().redeem("http://api", "x", vi.fn(async () => { throw new Error("down"); }), NOW)).toBe("offline");
  });
});

describe("promotional expiry", () => {
  test("remembers the server deadline and expires an already loaded scene", async () => {
    const deadline = NOW + 10_000;
    await useUnlocks.getState().redeem("http://api", "test", vi.fn(async () => reply(200, {
      token: "u1.a.b", items: ["koi-pond"], expires_at: new Date(deadline).toISOString(),
    })), NOW);
    expect(useUnlocks.getState().expiresAt).toBe(deadline);
    useUnlocks.getState().expire(deadline - 1);
    expect(useUnlocks.getState().items).toEqual(["koi-pond"]);
    useUnlocks.getState().expire(deadline);
    expect(useUnlocks.getState().items).toEqual([]);
    expect(window.localStorage.getItem("lbt-unlock")).toBeNull();
  });

  test("a recently cached promotional scene still expires while offline", async () => {
    window.localStorage.setItem("lbt-unlock", JSON.stringify({ token: "u1.a.b", items: ["koi-pond"], checkedAt: NOW - 1000, expiresAt: NOW }));
    const fetcher = vi.fn();
    await useUnlocks.getState().load("http://api", fetcher, NOW);
    expect(useUnlocks.getState().items).toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("load", () => {
  const save = (checkedAt: number) =>
    window.localStorage.setItem("lbt-unlock", JSON.stringify({ token: "u1.a.b", items: ["koi-pond"], checkedAt }));

  test("a recent check is trusted without asking the town", async () => {
    save(NOW - 3_600_000);
    const fetcher = vi.fn();
    await useUnlocks.getState().load("http://api", fetcher, NOW);
    expect([useUnlocks.getState().items, fetcher.mock.calls.length]).toEqual([["koi-pond"], 0]);
  });

  test("after a day it asks again, and a revoked code takes the pond away", async () => {
    save(NOW - 30 * 3_600_000);
    await useUnlocks.getState().load("http://api", vi.fn(async () => reply(200, { items: [] })), NOW);
    expect(useUnlocks.getState().items).toEqual([]);
    expect(window.localStorage.getItem("lbt-unlock")).toBeNull();
  });

  test("a refund of one code takes only that look away", async () => {
    window.localStorage.setItem("lbt-unlock", JSON.stringify({
      entries: [
        { token: "u1.pond", items: ["koi-pond"], expiresAt: null },
        { token: "u1.mint", items: ["style-mint"], expiresAt: null },
      ],
      checkedAt: NOW - 30 * 3_600_000,
    }));
    const fetcher = vi.fn(async (_url: string, init: RequestInit) =>
      reply(200, { items: String(init.body).includes("u1.pond") ? ["koi-pond"] : [] }));
    await useUnlocks.getState().load("http://api", fetcher as unknown as typeof fetch, NOW);
    expect(useUnlocks.getState().items).toEqual(["koi-pond"]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  test("an older single-code save still works", async () => {
    save(NOW - 3_600_000);
    await useUnlocks.getState().load("http://api", vi.fn(), NOW);
    expect(useUnlocks.getState().items).toEqual(["koi-pond"]);
  });

  test("when the town cannot be reached, the device keeps its unlock", async () => {
    save(NOW - 30 * 3_600_000);
    await useUnlocks.getState().load("http://api", vi.fn(async () => { throw new Error("down"); }), NOW);
    expect(useUnlocks.getState().items).toEqual(["koi-pond"]);
  });
});
