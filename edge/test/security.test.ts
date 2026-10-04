import { SELF } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, test } from "vitest";
import { adminSigningKey, boundedJson, MAX_BODY_BYTES, PayloadTooLarge, sameSecret } from "../src/security";
import { createAdminSession, createCompanionToken, verifyAdminSession, verifyCompanionToken, verifyGuestToken } from "../src/token";
import { forwardToSheet } from "../src/feedback";

const BASE = "https://api.lowbatterytown.com";
const ADMIN = `${BASE}/api/v1/admin/lbt`;
async function login(password = "admin-test-token", ip = "192.0.2.40") {
  return SELF.fetch(`${ADMIN}/login`, { method: "POST", headers: { Origin: BASE, "CF-Connecting-IP": ip }, body: JSON.stringify({ password }) });
}

describe("administrator session security", () => {
  test("uses a secure host-only cookie and revokes it at logout", async () => {
    const res = await login();
    const cookie = res.headers.get("Set-Cookie")!;
    expect(res.status).toBe(204);
    for (const flag of ["__Host-lbt-admin", "HttpOnly", "Secure", "SameSite=Strict", "Path=/", "Max-Age=43200"]) expect(cookie).toContain(flag);
    expect(cookie).not.toContain("Domain=");
    const headers = { Cookie: cookie.split(";")[0]!, Origin: BASE };
    expect((await SELF.fetch(`${ADMIN}/overview`, { headers })).status).toBe(200);
    const logout = await SELF.fetch(`${ADMIN}/logout`, { method: "POST", headers });
    expect(logout.headers.get("Set-Cookie")).toContain("Max-Age=0");
    expect((await SELF.fetch(`${ADMIN}/overview`, { headers })).status).toBe(401);
  });

  test("limits password guessing while allowing existing sessions", async () => {
    const session = await login("admin-test-token", "192.0.2.41");
    for (let i = 0; i < 9; i++) expect((await login("wrong", "192.0.2.41")).status).toBe(401);
    expect((await login("wrong", "192.0.2.41")).status).toBe(429);
    const headers = { Cookie: session.headers.get("Set-Cookie")!.split(";")[0]!, "CF-Connecting-IP": "192.0.2.41" };
    expect((await SELF.fetch(`${ADMIN}/overview`, { headers })).status).toBe(200);
    expect((await SELF.fetch(`${ADMIN}/overview`, { headers: { ...headers, Cookie: "", Authorization: "Bearer wrong" } })).status).toBe(429);
  });

  test.each(["login", "logout", "overview", "companion/token"])("blocks offsite %s", async path => {
    const res = await SELF.fetch(`${ADMIN}/${path}`, { method: path === "overview" ? "GET" : "POST", headers: { Origin: "https://evil.example", Authorization: "Bearer admin-test-token" } });
    expect(res.status).toBe(403);
  });

  test("strong server key, token purpose, expiry and password rotation are enforced", async () => {
    const key = await adminSigningKey(env.LBT_TOKEN_SECRET, "admin-test-token");
    const now = Date.now();
    const ticket = await createCompanionToken(key, now);
    expect(await verifyCompanionToken("admin-test-token", ticket.token, now)).toBe(false);
    const forged = await createCompanionToken("admin-test-token", now);
    expect(await verifyCompanionToken(key, forged.token, now)).toBe(false);
    const rotated = await adminSigningKey(env.LBT_TOKEN_SECRET, "new-password");
    expect(await verifyCompanionToken(rotated, ticket.token, now)).toBe(false);
    const a = await createAdminSession(key, now), b = await createAdminSession(key, now);
    expect(a.token).not.toBe(b.token);
    expect(await verifyAdminSession(rotated, a.token, now)).toBe(false);
    expect(await verifyAdminSession(key, a.token, now + 12 * 3600_000)).toBe(false);
    expect(await verifyGuestToken(key, a.token, now)).toBeNull();
    expect(await sameSecret("x", "x")).toBe(true);
    expect(await sameSecret("x", "xx")).toBe(false);
  });

  test("anonymous page probes do not use the password guess budget", async () => {
    for (let i = 0; i < 12; i++) expect((await SELF.fetch(`${ADMIN}/overview`, { headers: { "CF-Connecting-IP": "192.0.2.42" } })).status).toBe(401);
    expect((await login("admin-test-token", "192.0.2.42")).status).toBe(204);
  });

  test("admin page removes old cached passwords and does not store new ones", async () => {
    const html = await (await SELF.fetch(`${BASE}/admin`)).text();
    expect(html).not.toContain("sessionStorage.setItem(KEY");
    expect(html).not.toContain('"Bearer " + token()');
    expect(html).toContain('sessionStorage.removeItem("lbt.admin.token")');
  });
});

describe("transport limits", () => {
  test.each(["guest", "feedback", "reports", "ws"])("rejects offsite browser %s", async path => {
    const res = await SELF.fetch(`${BASE}/api/v1/lbt/${path}`, { method: path === "ws" ? "GET" : "POST", headers: { Origin: "https://evil.example", ...(path === "ws" ? { Upgrade: "websocket" } : {}) } });
    expect(res.status).toBe(403);
  });

  test("caps bodies including chunked data before parsing", async () => {
    const body = JSON.stringify({ message: "x".repeat(MAX_BODY_BYTES) });
    expect((await SELF.fetch(`${BASE}/api/v1/lbt/feedback`, { method: "POST", body })).status).toBe(413);
    const stream = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new TextEncoder().encode(body)); c.close(); } });
    await expect(boundedJson(new Response(stream))).rejects.toBeInstanceOf(PayloadTooLarge);
    await expect(boundedJson(new Response("{}", { headers: { "Content-Length": "999999" } }))).rejects.toBeInstanceOf(PayloadTooLarge);
    expect(await boundedJson(new Response("malformed"))).toBeNull();
  });

  test("does not accept JWTs in query strings", async () => {
    const issued = await SELF.fetch(`${BASE}/api/v1/lbt/guest`, { method: "POST" });
    const { token } = await issued.json() as { token: string };
    const res = await SELF.fetch(`${BASE}/api/v1/lbt/ws?token=${token}`, { headers: { Upgrade: "websocket" } });
    const ws = res.webSocket!;
    const closed = new Promise<number>(resolve => ws.addEventListener("close", e => resolve(e.code)));
    ws.accept();
    expect(await closed).toBe(4401);
  });

  test.each(["oversize", "binary", "flood"])("closes %s frames", async mode => {
    const issued = await SELF.fetch(`${BASE}/api/v1/lbt/guest`, { method: "POST" });
    const { token } = await issued.json() as { token: string };
    const res = await SELF.fetch(`${BASE}/api/v1/lbt/ws`, { headers: { Upgrade: "websocket", "Sec-WebSocket-Protocol": `bearer.${token}` } });
    const ws = res.webSocket!;
    const closed = new Promise<number>(resolve => ws.addEventListener("close", e => resolve(e.code)));
    ws.accept();
    if (mode === "oversize") ws.send("字".repeat(3000));
    else if (mode === "binary") ws.send(new Uint8Array(10));
    else for (let i = 0; i < 121; i++) ws.send(JSON.stringify({ type: "unknown" }));
    expect(await closed).toBe(mode === "flood" ? 4429 : 1009);
  });
});

describe("spreadsheet outbound security", () => {
  const record = { id: "security-test", category: "other" as const, message: "test", email: null, page: null, locale: null, status: "new" as const, createdAt: new Date().toISOString() };
  test("never sends the shared secret to an arbitrary host", async () => {
    let calls = 0;
    const fake = (async () => { calls++; return Response.json({ ok: true }); }) as typeof fetch;
    for (const url of ["https://evil.example/exec", "https://script.google.com.evil.example/macros/s/x/exec", "https://user:pass@script.google.com/macros/s/x/exec"]) expect(await forwardToSheet(env.DB, url, "secret", record, fake)).toBe(false);
    expect(calls).toBe(0);
  });
  test("does not follow arbitrary redirects", async () => {
    let calls = 0;
    const fake = (async () => { calls++; return new Response(null, { status: 302, headers: { Location: "https://evil.example/" } }); }) as typeof fetch;
    expect(await forwardToSheet(env.DB, "https://script.google.com/macros/s/x/exec", "secret", record, fake)).toBe(false);
    expect(calls).toBe(1);
  });
});
