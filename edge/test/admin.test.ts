/** Admin console: the page, its security headers, and the overview API. */
import { SELF } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, test } from "vitest";

import { adminPage } from "../src/adminPage";

const BASE = "https://api.lowbatterytown.com";
const AUTH = { Authorization: "Bearer admin-test-token" };

describe("admin page", () => {
  test("is served with a nonce CSP that allows only its own script and style", async () => {
    const res = await SELF.fetch(`${BASE}/admin`);
    const csp = res.headers.get("Content-Security-Policy") ?? "";
    const nonce = /script-src 'nonce-([0-9a-f]+)'/.exec(csp)?.[1];
    const html = await res.text();
    expect([
      res.status,
      Boolean(nonce),
      html.includes(`<script nonce="${nonce}">`),
      csp.includes("frame-ancestors 'none'"),
      res.headers.get("X-Robots-Tag"),
      res.headers.get("Cache-Control"),
    ]).toEqual([200, true, true, true, "noindex, nofollow", "no-store"]);
  });

  test("gets a fresh nonce on every request", async () => {
    const a = (await SELF.fetch(`${BASE}/admin`)).headers.get("Content-Security-Policy");
    const b = (await SELF.fetch(`${BASE}/admin`)).headers.get("Content-Security-Policy");
    expect(a).not.toBe(b);
  });

  test("never writes user text as HTML", () => {
    // Report notes and transcripts are user-written; the script must only use textContent.
    expect(adminPage("n")).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
  });
});

describe("overview API", () => {
  test("needs the admin token", async () => {
    expect((await SELF.fetch(`${BASE}/api/v1/admin/lbt/overview`)).status).toBe(401);
  });

  test("returns live numbers, report and feedback counts", async () => {
    await env.DB.prepare(
      `INSERT INTO lbt_reports (id, conversation_id, reporter_guest_id, reported_guest_id, reason, transcript,
         reporter_profile, reported_profile, status, created_at)
       VALUES ('r1','c','g_a','g_b','spam','[]','{}','{}','open', ?),
              ('r2','c','g_a','g_b','spam','[]','{}','{}','dismissed','2020-01-01T00:00:00.000Z')`,
    )
      .bind(new Date().toISOString())
      .run();
    const res = await SELF.fetch(`${BASE}/api/v1/admin/lbt/overview`, { headers: AUTH });
    expect(await res.json()).toEqual({
      online: 0,
      waiting: 0,
      open: true,
      hours: "",
      conversations: 0,
      reports: { byStatus: { open: 1, reviewed: 0, actioned: 0, dismissed: 1 }, last24h: 1 },
      feedback: { byStatus: { new: 0, read: 0, done: 0 } },
    });
  });
});
