/**
 * Feedback box: input rules, the honeypot, per-IP limit, D1 storage, admin
 * review, retention purge, and the Google Sheet forward (formula-safe, token
 * in the body, never fatal).
 */
import { SELF } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, test } from "vitest";

import { FEEDBACK_MAX, forwardToSheet, parseFeedback, sheetSafe } from "../src/feedback";
import { InputError } from "../src/rules";

const BASE = "https://api.lowbatterytown.com";
const AUTH = { Authorization: "Bearer admin-test-token" };

function post(body: unknown, ip = "198.51.100.10") {
  return SELF.fetch(`${BASE}/api/v1/lbt/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip, Origin: "https://www.lowbatterytown.com" },
    body: JSON.stringify(body),
  });
}

function code(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (err) {
    return err instanceof InputError ? err.code : "other";
  }
}

describe("parseFeedback", () => {
  test("accepts a minimal submission and cleans it", () => {
    expect(parseFeedback({ category: "idea", message: "  多一點夜景‮  " })).toEqual({
      category: "idea",
      message: "多一點夜景",
      email: null,
      page: null,
      locale: null,
    });
  });

  test("keeps a valid email, page path and locale", () => {
    const f = parseFeedback({ category: "bug", message: "x", email: " a@b.co ", page: "/zh-TW", locale: "zh-TW" });
    expect(f).toMatchObject({ email: "a@b.co", page: "/zh-TW", locale: "zh-TW" });
  });

  test("drops a page that is not a path and an unknown locale", () => {
    expect(parseFeedback({ category: "other", message: "x", page: "https://evil", locale: "fr" })).toMatchObject({
      page: null,
      locale: null,
    });
  });

  test("rejects bad input with a code", () => {
    expect(code(() => parseFeedback({ category: "rant", message: "x" }))).toBe("invalid_category");
    expect(code(() => parseFeedback({ category: "idea", message: "   " }))).toBe("invalid_message");
    expect(code(() => parseFeedback({ category: "idea", message: "x".repeat(FEEDBACK_MAX + 1) }))).toBe("invalid_message");
    expect(code(() => parseFeedback({ category: "idea", message: "x", email: "not-an-email" }))).toBe("invalid_email");
  });

  test("returns null when the honeypot is filled", () => {
    expect(parseFeedback({ category: "idea", message: "x", website: "spam.example" })).toBeNull();
  });
});

describe("sheetSafe", () => {
  test("neutralises formula prefixes and leaves plain text alone", () => {
    expect(sheetSafe("=HYPERLINK(\"x\")")).toBe("'=HYPERLINK(\"x\")");
    expect(sheetSafe("+1")).toBe("'+1");
    expect(sheetSafe("@a")).toBe("'@a");
    expect(sheetSafe("hello")).toBe("hello");
    expect(sheetSafe(null)).toBe("");
  });
});

describe("forwardToSheet", () => {
  const record = {
    id: "f-sheet",
    category: "idea" as const,
    message: "=1+1",
    email: null,
    page: "/zh-TW",
    locale: "zh-TW",
    status: "new" as const,
    createdAt: "2026-10-04T00:00:00.000Z",
  };

  test("does nothing without a configured https URL and token", async () => {
    let called = false;
    const fake = (async () => {
      called = true;
      return new Response("{}");
    }) as unknown as typeof fetch;
    expect(await forwardToSheet(env.DB, undefined, "t", record, fake)).toBe(false);
    expect(await forwardToSheet(env.DB, "http://insecure", "t", record, fake)).toBe(false);
    expect(await forwardToSheet(env.DB, "https://script.google.com/x", undefined, record, fake)).toBe(false);
    expect(called).toBe(false);
  });

  test("sends the token in the body, escapes formulas, and marks the row sent", async () => {
    await env.DB.prepare(
      "INSERT INTO lbt_feedback (id, category, message, status, created_at) VALUES ('f-sheet', 'idea', '=1+1', 'new', '2026-10-04T00:00:00.000Z')",
    ).run();
    let sent: Record<string, unknown> = {};
    const fake = (async (_url: string, init: RequestInit) => {
      sent = JSON.parse(String(init.body)) as Record<string, unknown>;
      return Response.json({ ok: true });
    }) as unknown as typeof fetch;
    expect(await forwardToSheet(env.DB, "https://script.google.com/macros/s/x/exec", "sheet-token", record, fake)).toBe(true);
    expect(sent).toMatchObject({ token: "sheet-token", id: "f-sheet", message: "'=1+1", category: "idea" });
    const row = await env.DB.prepare("SELECT sheet_sent FROM lbt_feedback WHERE id = 'f-sheet'").first<{ sheet_sent: number }>();
    expect(row?.sheet_sent).toBe(1);
  });

  test("follows the Apps Script 302 with a GET to the echo URL", async () => {
    await env.DB.prepare(
      "INSERT INTO lbt_feedback (id, category, message, status, created_at) VALUES ('f-redirect', 'idea', 'x', 'new', '2026-10-04T00:00:00.000Z')",
    ).run();
    const calls: { url: string; method: string; redirect?: string }[] = [];
    const fake = (async (url: string, init: RequestInit) => {
      calls.push({ url, method: init.method ?? "GET", redirect: init.redirect });
      if (calls.length === 1) {
        return new Response(null, { status: 302, headers: { Location: "https://script.googleusercontent.com/macros/echo?x=1" } });
      }
      return Response.json({ ok: true });
    }) as unknown as typeof fetch;
    const rec = { ...record, id: "f-redirect" };
    expect(await forwardToSheet(env.DB, "https://script.google.com/macros/s/x/exec", "t", rec, fake)).toBe(true);
    expect(calls).toEqual([
      { url: "https://script.google.com/macros/s/x/exec", method: "POST", redirect: "manual" },
      { url: "https://script.googleusercontent.com/macros/echo?x=1", method: "GET", redirect: "manual" },
    ]);
  });

  test("a failing sheet never throws", async () => {
    const boom = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const refused = (async () => Response.json({ ok: false }, { status: 200 })) as unknown as typeof fetch;
    expect(await forwardToSheet(env.DB, "https://script.google.com/macros/s/x/exec", "t", record, boom)).toBe(false);
    expect(await forwardToSheet(env.DB, "https://script.google.com/macros/s/x/exec", "t", record, refused)).toBe(false);
  });
});

describe("POST /api/v1/lbt/feedback", () => {
  test("stores a submission and returns its id", async () => {
    const res = await post({ category: "idea", message: "想要下雨的夜景", email: "me@example.com", page: "/zh-TW", locale: "zh-TW" });
    expect(res.status).toBe(201);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://www.lowbatterytown.com");
    const { id } = (await res.json()) as { id: string };
    const row = await env.DB.prepare("SELECT * FROM lbt_feedback WHERE id = ?").bind(id).first<Record<string, unknown>>();
    expect(row).toMatchObject({ category: "idea", message: "想要下雨的夜景", email: "me@example.com", status: "new", sheet_sent: 0 });
  });

  test("invalid input is a 422 with a code", async () => {
    const res = await post({ category: "idea", message: "" }, "198.51.100.11");
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("invalid_message");
  });

  test("the honeypot looks accepted but stores nothing", async () => {
    const before = await env.DB.prepare("SELECT COUNT(*) AS n FROM lbt_feedback").first<{ n: number }>();
    const res = await post({ category: "idea", message: "buy now", website: "x" }, "198.51.100.12");
    expect(res.status).toBe(201);
    const after = await env.DB.prepare("SELECT COUNT(*) AS n FROM lbt_feedback").first<{ n: number }>();
    expect(after?.n).toBe(before?.n);
  });

  test("is limited per IP", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await post({ category: "other", message: `#${i}` }, "198.51.100.13")).status);
    expect(statuses.slice(0, 5).every((s) => s === 201)).toBe(true);
    expect(statuses[5]).toBe(429);
  });
});

describe("admin feedback review", () => {
  test("needs the admin token", async () => {
    expect((await SELF.fetch(`${BASE}/api/v1/admin/lbt/feedback`)).status).toBe(401);
  });

  test("lists new feedback, changes status, and counts it in the overview", async () => {
    const res = await post({ category: "bug", message: "按鈕沒反應" }, "198.51.100.14");
    const { id } = (await res.json()) as { id: string };
    const list = (await (await SELF.fetch(`${BASE}/api/v1/admin/lbt/feedback`, { headers: AUTH })).json()) as {
      items: { id: string; status: string }[];
    };
    expect(list.items.some((f) => f.id === id && f.status === "new")).toBe(true);

    const set = await SELF.fetch(`${BASE}/api/v1/admin/lbt/feedback/${id}/status`, {
      method: "POST",
      headers: { ...AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({ status: "done" }),
    });
    expect(set.status).toBe(204);
    const bad = await SELF.fetch(`${BASE}/api/v1/admin/lbt/feedback/${id}/status`, {
      method: "POST",
      headers: { ...AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({ status: "deleted" }),
    });
    expect(bad.status).toBe(422);
    const missing = await SELF.fetch(`${BASE}/api/v1/admin/lbt/feedback/nope/status`, {
      method: "POST",
      headers: { ...AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({ status: "read" }),
    });
    expect(missing.status).toBe(404);

    const overview = (await (await SELF.fetch(`${BASE}/api/v1/admin/lbt/overview`, { headers: AUTH })).json()) as {
      feedback: { byStatus: Record<string, number> };
    };
    expect(overview.feedback.byStatus.done).toBeGreaterThanOrEqual(1);
  });

  test("the daily cron purges feedback past retention", async () => {
    await env.DB.prepare(
      "INSERT INTO lbt_feedback (id, category, message, status, created_at) VALUES ('old-f', 'idea', 'x', 'new', '2020-01-01T00:00:00.000Z')",
    ).run();
    const { default: worker } = await import("../src/index");
    await worker.scheduled({ cron: "17 19 * * *", scheduledTime: Date.now(), noRetry() {} } as ScheduledController, env, {} as ExecutionContext);
    expect(await env.DB.prepare("SELECT id FROM lbt_feedback WHERE id = 'old-f'").first()).toBeNull();
  });
});
