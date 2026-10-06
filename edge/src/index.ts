/**
 * LowBatteryTown API on Cloudflare Workers, served at api.lowbatterytown.com.
 * Same routes and frames as backend/app/api/v1/lbt so the frontend's
 * liveTransport talks to it unchanged:
 *
 *   POST /api/v1/lbt/guest     anonymous guest token (rate-limited per IP)
 *   GET  /api/v1/lbt/status    real online / waiting counts, open flag
 *   POST /api/v1/lbt/reports   safety report (guest bearer token)
 *   GET  /api/v1/lbt/ws        WebSocket, subprotocol `bearer.{token}`
 *   POST /api/v1/lbt/feedback  feedback box (anonymous, rate-limited per IP; copied to the owner's Google Sheet)
 *   GET  /api/v1/admin/lbt/overview, /reports, /feedback, POST …/{id}/status   (ADMIN_TOKEN)
 *   GET  /admin                admin console page (signs in with ADMIN_TOKEN)
 *
 * The town itself is one Durable Object (src/townObject.ts); reports go to D1.
 */
import { type Env, feedbackRetentionDays, retentionDays, tokenTtlHours } from "./config";
import { adminPage, adminPageHeaders } from "./adminPage";
import {
  FEEDBACK_STATUSES,
  type FeedbackStatus,
  feedbackCounts,
  forwardToSheet,
  listFeedback,
  parseFeedback,
  purgeFeedback,
  saveFeedback,
  setFeedbackStatus,
} from "./feedback";
import { InputError } from "./rules";
import { REPORT_STATUSES, type ReportStatus, listReports, purgeReports, reportCounts, setReportStatus } from "./reports";
import { listDailyTrends } from "./dailyStats";
import { createAdminSession, verifyAdminSession, createCompanionToken, createGuestToken, newGuestId, verifyCompanionToken, verifyGuestToken } from "./token";
import { COMPANION_ID } from "./companion";
import { purgeExpiredSuspensions } from "./moderation";

import { adminCookie, adminSigningKey, boundedJson, cookieToken, PayloadTooLarge, sameSecret, tokenFingerprint } from "./security";

export { TownObject } from "./townObject";

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Cache-Control": "no-store",
  "X-Frame-Options": "DENY",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get("Origin");
  const allowed = (env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  if (!origin || !allowed.includes(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

function json(request: Request, env: Env, status: number, body: unknown): Response {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: {
      ...(body === null ? {} : { "Content-Type": "application/json" }),
      ...SECURITY_HEADERS,
      ...corsHeaders(request, env),
    },
  });
}

/** Same envelope as the FastAPI backend's LowBatteryTownError. */
function error(request: Request, env: Env, status: number, code: string): Response {
  return json(request, env, status, { error: { code, message: code } });
}

const clientIp = (request: Request) => request.headers.get("CF-Connecting-IP") ?? "unknown";
const town = (env: Env) => env.TOWN.get(env.TOWN.idFromName("town"));

function bearer(request: Request): string | null {
  const auth = request.headers.get("Authorization") ?? "";
  return auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : null;
}

/** Token from `Sec-WebSocket-Protocol: bearer.<jwt>` (browsers can't set headers on sockets). */
function socketToken(request: Request): { token: string | null; protocol: string | null } {
  for (const p of (request.headers.get("Sec-WebSocket-Protocol") ?? "").split(",")) {
    const proto = p.trim();
    if (proto.startsWith("bearer.")) return { token: proto.slice(7), protocol: proto };
  }
  return { token: null, protocol: null };
}

/** Accept then close with an application code, so the client sees why (e.g. 4401 → drop token). */
function rejectSocket(code: number, protocol: string | null): Response {
  const { 0: client, 1: server } = new WebSocketPair();
  server.accept();
  server.close(code, code === 4401 ? "unauthorized" : "rejected");
  return new Response(null, {
    status: 101,
    webSocket: client,
    headers: protocol ? { "Sec-WebSocket-Protocol": protocol } : undefined,
  });
}

async function handleSocket(request: Request, env: Env): Promise<Response> {
  if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
    return error(request, env, 426, "websocket_required");
  }
  const { token, protocol } = socketToken(request);
  const guestId = token ? await verifyGuestToken(env.LBT_TOKEN_SECRET, token, Date.now()) : null;
  if (!guestId) return rejectSocket(4401, protocol);
  const headers = new Headers(request.headers);
  headers.set("x-lbt-guest", guestId);
  headers.set("x-lbt-ip", clientIp(request));
  headers.delete("x-lbt-protocol");
  if (protocol) headers.set("x-lbt-protocol", protocol);
  return town(env).fetch(new Request(request.url, { headers }));
}

async function handleAdmin(request: Request, env: Env, path: string): Promise<Response> {
  const token = bearer(request);
  if (!env.ADMIN_TOKEN) return error(request, env, 401, "unauthorized");
  const signingKey = await adminSigningKey(env.LBT_TOKEN_SECRET, env.ADMIN_TOKEN);
  const session = cookieToken(request);
  const authenticated = session && await verifyAdminSession(signingKey, session, Date.now()) &&
    !(await town(env).adminSessionRevoked(await tokenFingerprint(session)));
  if (!authenticated) {
    // Anonymous page probes are not password guesses; only bearer attempts count.
    if (!token) return error(request, env, 401, "unauthorized");
    // Keep owner CLI bearer authentication; failed attempts share the login limit.
    if (await town(env).adminLoginBlocked(clientIp(request))) return error(request, env, 429, "too_many_login_attempts");
    if (token.length > 1024 || !(await sameSecret(token, env.ADMIN_TOKEN))) {
      if (!(await town(env).allowAdminLogin(clientIp(request)))) return error(request, env, 429, "too_many_login_attempts");
      return error(request, env, 401, "unauthorized");
    }
  }
  if (path === "/api/v1/admin/lbt/companion/token" && request.method === "POST") {
    const ticket = await createCompanionToken(signingKey, Date.now());
    return json(request, env, 200, { token: ticket.token, expires_at: ticket.expiresAt });
  }
  if (path === "/api/v1/admin/lbt/waiting" && request.method === "GET") {
    return json(request, env, 200, { items: await town(env).adminWaiting() });
  }
  if (request.method === "GET" && path === "/api/v1/admin/lbt/overview") {
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const [live, reports, feedback] = await Promise.all([
      town(env).adminStats(),
      reportCounts(env.DB, since),
      feedbackCounts(env.DB),
    ]);
    return json(request, env, 200, { ...live, reports, feedback });
  }
  if (request.method === "POST" && path === "/api/v1/admin/lbt/maintenance") {
    const body = (await boundedJson(request)) as { paused?: unknown } | null;
    if (typeof body?.paused !== "boolean") return error(request, env, 422, "invalid_maintenance");
    return json(request, env, 200, await town(env).setMaintenance(body.paused));
  }
  if (request.method === "GET" && path === "/api/v1/admin/lbt/trends") {
    const days = Number(new URL(request.url).searchParams.get("days")) || 30;
    return json(request, env, 200, { items: await listDailyTrends(env.DB, Date.now(), days) });
  }
  if (request.method === "GET" && path === "/api/v1/admin/lbt/reports") {
    const params = new URL(request.url).searchParams;
    const raw = params.get("status") ?? "open";
    const status = raw === "all" ? null : (raw as ReportStatus);
    if (status && !REPORT_STATUSES.includes(status)) return error(request, env, 422, "invalid_status");
    const limit = Math.min(200, Math.max(1, Number(params.get("limit")) || 50));
    return json(request, env, 200, { items: await listReports(env.DB, status, limit) });
  }
  const moderation = /^\/api\/v1\/admin\/lbt\/reports\/([^/]+)\/moderation$/.exec(path);
  if (request.method === "POST" && moderation) {
    const result = await town(env).moderate(decodeURIComponent(moderation[1] as string), await boundedJson(request));
    return result.ok ? json(request, env, 200, result)
      : error(request, env, result.code === "report_not_found" ? 404 : result.code === "no_active_suspension" ? 409 : 422, result.code);
  }
  const m = /^\/api\/v1\/admin\/lbt\/reports\/([^/]+)\/status$/.exec(path);
  if (request.method === "POST" && m) {
    const body = (await boundedJson(request)) as { status?: unknown } | null;
    const status = body?.status;
    if (typeof status !== "string" || !REPORT_STATUSES.includes(status as ReportStatus)) {
      return error(request, env, 422, "invalid_status");
    }
    const found = await setReportStatus(env.DB, decodeURIComponent(m[1] as string), status as ReportStatus);
    return found ? json(request, env, 204, null) : error(request, env, 404, "report_not_found");
  }
  if (request.method === "GET" && path === "/api/v1/admin/lbt/feedback") {
    const params = new URL(request.url).searchParams;
    const raw = params.get("status") ?? "new";
    const status = raw === "all" ? null : (raw as FeedbackStatus);
    if (status && !FEEDBACK_STATUSES.includes(status)) return error(request, env, 422, "invalid_status");
    const limit = Math.min(200, Math.max(1, Number(params.get("limit")) || 50));
    return json(request, env, 200, { items: await listFeedback(env.DB, status, limit) });
  }
  const f = /^\/api\/v1\/admin\/lbt\/feedback\/([^/]+)\/status$/.exec(path);
  if (request.method === "POST" && f) {
    const body = (await boundedJson(request)) as { status?: unknown } | null;
    const status = body?.status;
    if (typeof status !== "string" || !FEEDBACK_STATUSES.includes(status as FeedbackStatus)) {
      return error(request, env, 422, "invalid_status");
    }
    const found = await setFeedbackStatus(env.DB, decodeURIComponent(f[1] as string), status as FeedbackStatus);
    return found ? json(request, env, 204, null) : error(request, env, 404, "feedback_not_found");
  }
  return error(request, env, 404, "not_found");
}

/** Feedback box: validate, store in D1, then copy to the Google Sheet in the background. */
async function handleFeedback(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (!(await town(env).allowFeedback(clientIp(request)))) return error(request, env, 429, "too_many_feedback");
  let input;
  try {
    input = parseFeedback(await boundedJson(request));
  } catch (err) {
    if (err instanceof InputError) return error(request, env, 422, err.code);
    throw err;
  }
  // Honeypot filled in: look successful, keep nothing.
  if (!input) return json(request, env, 201, { id: crypto.randomUUID() });
  const record = { ...input, id: crypto.randomUUID(), status: "new" as const, createdAt: new Date().toISOString() };
  await saveFeedback(env.DB, record);
  ctx.waitUntil(forwardToSheet(env.DB, env.FEEDBACK_SHEET_URL, env.FEEDBACK_SHEET_TOKEN, record));
  return json(request, env, 201, { id: record.id });
}

async function route(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const path = new URL(request.url).pathname.replace(/\/+$/, "") || "/";

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { ...corsHeaders(request, env), ...SECURITY_HEADERS } });
  }
  const origin = request.headers.get("Origin");
  if (path.startsWith("/api/")) {
    const allowed = path.startsWith("/api/v1/admin/")
      ? [new URL(request.url).origin]
      : (env.ALLOWED_ORIGINS ?? "").split(",").map(o => o.trim());
    if (origin && !allowed.includes(origin)) return error(request, env, 403, "origin_not_allowed");
    // Cookie authentication must never accept cross-site browser requests, even without Origin.
    if (path.startsWith("/api/v1/admin/") && request.headers.get("Sec-Fetch-Site") === "cross-site") {
      return error(request, env, 403, "origin_not_allowed");
    }
  }
  if (path === "/api/v1/admin/lbt/login" && request.method === "POST") {
    if (!(await town(env).allowAdminLogin(clientIp(request)))) return error(request, env, 429, "too_many_login_attempts");
    const body = await boundedJson(request) as { password?: unknown } | null;
    if (!env.ADMIN_TOKEN || typeof body?.password !== "string" || body.password.length > 1024 ||
        !(await sameSecret(body.password, env.ADMIN_TOKEN))) return error(request, env, 401, "unauthorized");
    const session = await createAdminSession(await adminSigningKey(env.LBT_TOKEN_SECRET, env.ADMIN_TOKEN), Date.now());
    const response = json(request, env, 204, null);
    response.headers.set("Set-Cookie", adminCookie(session.token));
    return response;
  }
  if (path === "/api/v1/admin/lbt/logout" && request.method === "POST") {
    const session = cookieToken(request);
    if (session && env.ADMIN_TOKEN && await verifyAdminSession(await adminSigningKey(env.LBT_TOKEN_SECRET, env.ADMIN_TOKEN), session, Date.now())) {
      await town(env).revokeAdminSession(await tokenFingerprint(session));
    }
    const response = json(request, env, 204, null);
    response.headers.set("Set-Cookie", adminCookie("", 0));
    return response;
  }
  if (path === "/healthz") return json(request, env, 200, { ok: true });

  // Admin console (sign-in happens in the page; every data call checks ADMIN_TOKEN).
  if (path === "/admin" && request.method === "GET") {
    const nonce = crypto.randomUUID().replace(/-/g, "");
    return new Response(adminPage(nonce), { headers: adminPageHeaders(nonce, new URL(request.url).origin) });
  }

  if (path === "/api/v1/lbt/ws") return handleSocket(request, env);

  if (path === "/api/v1/admin/lbt/companion/ws") {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return error(request, env, 426, "websocket_required");
    const origin = request.headers.get("Origin");
    if (origin && origin !== new URL(request.url).origin) return error(request, env, 403, "origin_not_allowed");
    const { token, protocol } = socketToken(request);
    // Do not accept query credentials for administrator connections.
    if (!env.ADMIN_TOKEN || !protocol || !token || !(await verifyCompanionToken(await adminSigningKey(env.LBT_TOKEN_SECRET, env.ADMIN_TOKEN), token, Date.now()))) {
      return rejectSocket(4401, protocol);
    }
    const headers = new Headers(request.headers);
    headers.set("x-lbt-guest", COMPANION_ID);
    headers.set("x-lbt-ip", clientIp(request));
    headers.set("x-lbt-protocol", protocol);
    return town(env).fetch(new Request(request.url, { headers }));
  }

  if (path === "/api/v1/lbt/status" && request.method === "GET") {
    return json(request, env, 200, await town(env).status());
  }

  if (path === "/api/v1/lbt/guest" && request.method === "POST") {
    if (!(await town(env).allowGuest(clientIp(request)))) {
      return error(request, env, 429, "too_many_guest_sessions");
    }
    const guestId = newGuestId();
    const { token, expiresAt } = await createGuestToken(env.LBT_TOKEN_SECRET, guestId, Date.now(), tokenTtlHours(env));
    return json(request, env, 200, { guest_id: guestId, token, expires_at: expiresAt });
  }

  if (path === "/api/v1/lbt/reports" && request.method === "POST") {
    const token = bearer(request);
    const guestId = token ? await verifyGuestToken(env.LBT_TOKEN_SECRET, token, Date.now()) : null;
    if (!guestId) return error(request, env, 401, "missing_guest_token");
    const body = (await boundedJson(request)) as { reason?: unknown; note?: unknown } | null;
    const note = body?.note;
    if (typeof body?.reason !== "string") return error(request, env, 422, "invalid_reason");
    if (note !== undefined && note !== null && (typeof note !== "string" || Array.from(note).length > 500)) {
      return error(request, env, 422, "invalid_note");
    }
    const result = await town(env).report(guestId, body.reason, note ?? null);
    return result.ok ? json(request, env, 201, { id: result.id }) : error(request, env, result.status, result.code);
  }

  if (path === "/api/v1/lbt/feedback" && request.method === "POST") return handleFeedback(request, env, ctx);

  if (path.startsWith("/api/v1/admin/lbt/")) return handleAdmin(request, env, path);

  return error(request, env, 404, "not_found");
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    if (!env.LBT_TOKEN_SECRET || env.LBT_TOKEN_SECRET.length < 32) {
      return error(request, env, 500, "server_misconfigured");
    }
    try {
      return await route(request, env, ctx);
    } catch (err) {
      if (err instanceof PayloadTooLarge) return error(request, env, 413, "payload_too_large");
      // Never include tokens, request URLs, body contents or database errors in logs/responses.
      console.error(JSON.stringify({ event: "lbt_request_failed" }));
      return error(request, env, 500, "internal_error");
    }
  },

  /** Daily: delete reports and feedback past their retention windows (the privacy page promises it). */
  async scheduled(_controller, env, _ctx): Promise<void> {
    const cutoff = new Date(Date.now() - retentionDays(env) * 86_400_000).toISOString();
    await purgeExpiredSuspensions(env.DB, Date.now());
    const removed = await purgeReports(env.DB, cutoff);
    if (removed > 0) console.log(JSON.stringify({ event: "lbt_reports_purged", removed, cutoff }));
    const feedbackCutoff = new Date(Date.now() - feedbackRetentionDays(env) * 86_400_000).toISOString();
    const feedbackRemoved = await purgeFeedback(env.DB, feedbackCutoff);
    if (feedbackRemoved > 0) {
      console.log(JSON.stringify({ event: "lbt_feedback_purged", removed: feedbackRemoved, cutoff: feedbackCutoff }));
    }
  },
} satisfies ExportedHandler<Env>;
