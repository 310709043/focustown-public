/**
 * LowBatteryTown API on Cloudflare Workers, served at api.lowbatterytown.com.
 * Same routes and frames as backend/app/api/v1/lbt so the frontend's
 * liveTransport talks to it unchanged:
 *
 *   POST /api/v1/lbt/guest     anonymous guest token (rate-limited per IP)
 *   GET  /api/v1/lbt/status    real online / waiting counts, open flag
 *   POST /api/v1/lbt/reports   safety report (guest bearer token)
 *   GET  /api/v1/lbt/ws        WebSocket, subprotocol `bearer.{token}`
 *   GET  /api/v1/admin/lbt/overview, /reports, POST …/{id}/status   (ADMIN_TOKEN)
 *   GET  /admin                admin console page (signs in with ADMIN_TOKEN)
 *
 * The town itself is one Durable Object (src/townObject.ts); reports go to D1.
 */
import { type Env, retentionDays, tokenTtlHours } from "./config";
import { adminPage, adminPageHeaders } from "./adminPage";
import { REPORT_STATUSES, type ReportStatus, listReports, purgeReports, reportCounts, setReportStatus } from "./reports";
import { createCompanionToken, createGuestToken, newGuestId, verifyCompanionToken, verifyGuestToken } from "./token";
import { COMPANION_ID } from "./companion";

export { TownObject } from "./townObject";

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Cache-Control": "no-store",
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

/** Constant-time string comparison for the admin token. */
function sameSecret(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/** Token from `Sec-WebSocket-Protocol: bearer.<jwt>` (browsers can't set headers on sockets). */
function socketToken(request: Request): { token: string | null; protocol: string | null } {
  for (const p of (request.headers.get("Sec-WebSocket-Protocol") ?? "").split(",")) {
    const proto = p.trim();
    if (proto.startsWith("bearer.")) return { token: proto.slice(7), protocol: proto };
  }
  return { token: new URL(request.url).searchParams.get("token"), protocol: null };
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
  if (protocol) headers.set("x-lbt-protocol", protocol);
  return town(env).fetch(new Request(request.url, { headers }));
}

async function handleAdmin(request: Request, env: Env, path: string): Promise<Response> {
  const token = bearer(request);
  if (!env.ADMIN_TOKEN || !token || !sameSecret(token, env.ADMIN_TOKEN)) {
    return error(request, env, 401, "unauthorized");
  }
  if (path === "/api/v1/admin/lbt/companion/token" && request.method === "POST") {
    const ticket = await createCompanionToken(env.ADMIN_TOKEN, Date.now());
    return json(request, env, 200, { token: ticket.token, expires_at: ticket.expiresAt });
  }
  if (path === "/api/v1/admin/lbt/waiting" && request.method === "GET") {
    return json(request, env, 200, { items: await town(env).adminWaiting() });
  }
  if (request.method === "GET" && path === "/api/v1/admin/lbt/overview") {
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const [live, reports] = await Promise.all([town(env).adminStats(), reportCounts(env.DB, since)]);
    return json(request, env, 200, { ...live, reports });
  }
  if (request.method === "GET" && path === "/api/v1/admin/lbt/reports") {
    const params = new URL(request.url).searchParams;
    const raw = params.get("status") ?? "open";
    const status = raw === "all" ? null : (raw as ReportStatus);
    if (status && !REPORT_STATUSES.includes(status)) return error(request, env, 422, "invalid_status");
    const limit = Math.min(200, Math.max(1, Number(params.get("limit")) || 50));
    return json(request, env, 200, { items: await listReports(env.DB, status, limit) });
  }
  const m = /^\/api\/v1\/admin\/lbt\/reports\/([^/]+)\/status$/.exec(path);
  if (request.method === "POST" && m) {
    const body = (await request.json().catch(() => null)) as { status?: unknown } | null;
    const status = body?.status;
    if (typeof status !== "string" || !REPORT_STATUSES.includes(status as ReportStatus)) {
      return error(request, env, 422, "invalid_status");
    }
    const found = await setReportStatus(env.DB, decodeURIComponent(m[1] as string), status as ReportStatus);
    return found ? json(request, env, 204, null) : error(request, env, 404, "report_not_found");
  }
  return error(request, env, 404, "not_found");
}

async function route(request: Request, env: Env): Promise<Response> {
  const path = new URL(request.url).pathname.replace(/\/+$/, "") || "/";

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { ...corsHeaders(request, env), ...SECURITY_HEADERS } });
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
    if (!env.ADMIN_TOKEN || !protocol || !token || !(await verifyCompanionToken(env.ADMIN_TOKEN, token, Date.now()))) {
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
    const body = (await request.json().catch(() => null)) as { reason?: unknown; note?: unknown } | null;
    const note = body?.note;
    if (typeof body?.reason !== "string") return error(request, env, 422, "invalid_reason");
    if (note !== undefined && note !== null && (typeof note !== "string" || Array.from(note).length > 500)) {
      return error(request, env, 422, "invalid_note");
    }
    const result = await town(env).report(guestId, body.reason, note ?? null);
    return result.ok ? json(request, env, 201, { id: result.id }) : error(request, env, result.status, result.code);
  }

  if (path.startsWith("/api/v1/admin/lbt/")) return handleAdmin(request, env, path);

  return error(request, env, 404, "not_found");
}

export default {
  async fetch(request, env): Promise<Response> {
    if (!env.LBT_TOKEN_SECRET || env.LBT_TOKEN_SECRET.length < 32) {
      return error(request, env, 500, "server_misconfigured");
    }
    return route(request, env);
  },

  /** Daily: delete report snapshots past the retention window (the privacy page promises it). */
  async scheduled(_controller, env, _ctx): Promise<void> {
    const cutoff = new Date(Date.now() - retentionDays(env) * 86_400_000).toISOString();
    const removed = await purgeReports(env.DB, cutoff);
    if (removed > 0) console.log(JSON.stringify({ event: "lbt_reports_purged", removed, cutoff }));
  },
} satisfies ExportedHandler<Env>;
