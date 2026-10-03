import { describe, expect, test } from "vitest";

import { createGuestToken, newGuestId, verifyGuestToken } from "../src/token";

const SECRET = "s".repeat(40);
const NOW = Date.UTC(2026, 9, 3, 13, 0);

describe("guest tokens", () => {
  test("round-trip to the guest id", async () => {
    const id = newGuestId();
    const { token } = await createGuestToken(SECRET, id, NOW, 24);
    expect([id.startsWith("g_"), await verifyGuestToken(SECRET, token, NOW + 1000)]).toEqual([true, id]);
  });

  test("expire after the TTL", async () => {
    const { token, expiresAt } = await createGuestToken(SECRET, "g_x", NOW, 24);
    expect([expiresAt, await verifyGuestToken(SECRET, token, NOW + 24 * 3600_000)]).toEqual([
      new Date(NOW + 24 * 3600_000).toISOString(),
      null,
    ]);
  });

  test("signed with another secret are rejected", async () => {
    const { token } = await createGuestToken("t".repeat(40), "g_x", NOW, 24);
    expect(await verifyGuestToken(SECRET, token, NOW)).toBeNull();
  });

  test("with a tampered payload are rejected", async () => {
    const { token } = await createGuestToken(SECRET, "g_x", NOW, 24);
    const [h, , s] = token.split(".");
    const forged = btoa(JSON.stringify({ sub: "g_y", exp: 9e9, type: "lbt_guest" })).replace(/=+$/, "");
    expect(await verifyGuestToken(SECRET, `${h}.${forged}.${s}`, NOW)).toBeNull();
  });

  test.each(["", "a.b", "a.b.c", "not-a-jwt"])("garbage %j is rejected", async (t) =>
    expect(await verifyGuestToken(SECRET, t, NOW)).toBeNull());
});
