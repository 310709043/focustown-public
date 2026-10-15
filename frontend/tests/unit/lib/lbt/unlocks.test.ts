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
  useUnlocks.setState({ items: [], loaded: false });
});

describe("redeem", () => {
  test("a good code unlocks the pond and is remembered on this device", async () => {
    const fetcher = vi.fn(async () => reply(200, { token: "u1.a.b", items: ["koi-pond"] }));
    expect(await useUnlocks.getState().redeem("http://api", "abcd-efgh-jkmn", fetcher, NOW)).toBe("ok");
    expect(useUnlocks.getState().items).toEqual(["koi-pond"]);
    expect(JSON.parse(window.localStorage.getItem("lbt-unlock")!)).toEqual({ token: "u1.a.b", items: ["koi-pond"], checkedAt: NOW });
    expect(fetcher).toHaveBeenCalledWith("http://api/api/v1/lbt/unlock", expect.objectContaining({ method: "POST", body: '{"code":"abcd-efgh-jkmn"}' }));
  });

  test.each([
    [reply(422, { error: { code: "invalid_code" } }), "invalid_code"],
    [reply(409, { error: { code: "code_used_up" } }), "code_used_up"],
    [reply(429, {}), "too_many"],
  ] as const)("a refusal becomes a plain outcome (%#)", async (res, outcome) => {
    expect(await useUnlocks.getState().redeem("http://api", "x", vi.fn(async () => res), NOW)).toBe(outcome);
    expect(useUnlocks.getState().items).toEqual([]);
  });

  test("no connection says so", async () => {
    expect(await useUnlocks.getState().redeem("http://api", "x", vi.fn(async () => { throw new Error("down"); }), NOW)).toBe("offline");
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

  test("when the town cannot be reached, the device keeps its unlock", async () => {
    save(NOW - 30 * 3_600_000);
    await useUnlocks.getState().load("http://api", vi.fn(async () => { throw new Error("down"); }), NOW);
    expect(useUnlocks.getState().items).toEqual(["koi-pond"]);
  });
});
