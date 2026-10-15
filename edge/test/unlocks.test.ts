/**
 * Unlock codes for paid extras: only the owner makes them, a code unlocks
 * its item on a limited number of devices, revoking it (a refund) takes the
 * item away at the next check, forged tokens unlock nothing, and guessing
 * is rate-limited per IP.
 */
import { SELF } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, test } from "vitest";

import { newCode, normalizeCode } from "../src/unlocks";

const BASE = "https://api.lowbatterytown.com";
const AUTH = { Authorization: "Bearer admin-test-token" };
let ipSeq = 0;
const ip = () => `198.51.100.${++ipSeq % 250}`;

const make = async (body: Record<string, unknown> = { item: "koi-pond", count: 1 }) =>
  SELF.fetch(`${BASE}/api/v1/admin/lbt/unlocks`, { method: "POST", headers: AUTH, body: JSON.stringify(body) });
const redeem = (code: unknown, from = ip()) =>
  SELF.fetch(`${BASE}/api/v1/lbt/unlock`, { method: "POST", headers: { "CF-Connecting-IP": from }, body: JSON.stringify({ code }) });
const verify = async (token: unknown) =>
  ((await (await SELF.fetch(`${BASE}/api/v1/lbt/unlock/verify`, { method: "POST", body: JSON.stringify({ token }) })).json()) as { items: string[] }).items;

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM lbt_unlock_codes").run();
});

describe("codes", () => {
  test("are 12 unambiguous characters in three groups, and typing them loosely still works", () => {
    const code = newCode();
    expect(code).toMatch(/^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
    expect(normalizeCode(` ${code.toLowerCase().replace(/-/g, " ")} `)).toBe(code.replace(/-/g, ""));
    for (const bad of ["", "ABCD-EFGH", "ABCD-EFGH-IJK0", "ABCD-EFGH-JKMNP", 42, "x".repeat(100)]) expect(normalizeCode(bad)).toBeNull();
  });
});

describe("admin", () => {
  test("only the owner can make, list or revoke codes", async () => {
    expect((await SELF.fetch(`${BASE}/api/v1/admin/lbt/unlocks`)).status).toBe(401);
    expect((await SELF.fetch(`${BASE}/api/v1/admin/lbt/unlocks`, { method: "POST", body: "{}" })).status).toBe(401);
    expect((await SELF.fetch(`${BASE}/api/v1/admin/lbt/unlocks/x/revoke`, { method: "POST" })).status).toBe(401);
  });

  test("codes are shown once; the list keeps only a hint, the note and the counts", async () => {
    const res = await make({ item: "koi-pond", count: 2, note: "BMC 第 3 筆" });
    const { codes } = (await res.json()) as { codes: string[] };
    expect([res.status, codes.length, new Set(codes).size]).toEqual([201, 2, 2]);
    const list = (await (await SELF.fetch(`${BASE}/api/v1/admin/lbt/unlocks`, { headers: AUTH })).json()) as { items: Record<string, unknown>[] };
    expect(list.items).toHaveLength(2);
    expect(list.items[0]).toMatchObject({ item: "koi-pond", note: "BMC 第 3 筆", maxDevices: 3, redemptions: 0, revoked: false });
    expect(codes.map((c) => c.slice(0, 4)).sort()).toEqual(list.items.map((r) => r.hint).sort());
    expect(JSON.stringify(list)).not.toMatch(/code_hash|[A-Z2-9]{4}-[A-Z2-9]{4}/);
  });

  test("rejects unknown items and silly counts", async () => {
    expect((await make({ item: "dragon", count: 1 })).status).toBe(422);
    expect((await make({ item: "koi-pond", count: 0 })).status).toBe(422);
    expect((await make({ item: "koi-pond", count: 500 })).status).toBe(422);
  });
});

describe("redeeming", () => {
  test("a code unlocks the pond on up to three devices, then says it is used up", async () => {
    const { codes } = (await (await make()).json()) as { codes: string[] };
    const tokens: string[] = [];
    for (let i = 0; i < 3; i++) {
      const res = await redeem(codes[0]);
      const body = (await res.json()) as { token: string; items: string[] };
      expect([res.status, body.items]).toEqual([200, ["koi-pond"]]);
      tokens.push(body.token);
    }
    const fourth = await redeem(codes[0]);
    expect([fourth.status, ((await fourth.json()) as { error: { code: string } }).error.code]).toEqual([409, "code_used_up"]);
    expect(await verify(tokens[2])).toEqual(["koi-pond"]);
  });

  test("an unknown code is refused without saying more", async () => {
    const res = await redeem("ABCD-EFGH-JKMN");
    expect([res.status, ((await res.json()) as { error: { code: string } }).error.code]).toEqual([422, "invalid_code"]);
  });

  test("revoking a code (a refund) takes the pond away and stops new redemptions", async () => {
    const { codes } = (await (await make()).json()) as { codes: string[] };
    const { token } = (await (await redeem(codes[0])).json()) as { token: string };
    const id = ((await env.DB.prepare("SELECT id FROM lbt_unlock_codes").first()) as { id: string }).id;
    expect((await SELF.fetch(`${BASE}/api/v1/admin/lbt/unlocks/${id}/revoke`, { method: "POST", headers: AUTH })).status).toBe(204);
    expect(await verify(token)).toEqual([]);
    expect((await redeem(codes[0])).status).toBe(422);
  });

  test("forged or garbled tokens unlock nothing", async () => {
    const { codes } = (await (await make()).json()) as { codes: string[] };
    const { token } = (await (await redeem(codes[0])).json()) as { token: string };
    const [prefix, payload] = token.split(".");
    for (const bad of [`${prefix}.${payload}.AAAA`, "u1.e30.e30", "nonsense", 7, null]) expect(await verify(bad)).toEqual([]);
  });

  test("guessing is limited to ten tries an hour per address", async () => {
    const from = "203.0.113.77";
    for (let i = 0; i < 10; i++) expect((await redeem("ABCD-EFGH-JKMN", from)).status).toBe(422);
    expect((await redeem("ABCD-EFGH-JKMN", from)).status).toBe(429);
  });
});
