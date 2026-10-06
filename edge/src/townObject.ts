/**
 * The whole town lives in one Durable Object: it holds every guest's
 * WebSocket (hibernation API, tagged with the guest id) and the session
 * state, and runs events one at a time, so pairing and extension votes
 * need no locks. An alarm sweeps every few seconds while anyone is
 * waiting or chatting.
 */
import { DurableObject } from "cloudflare:workers";

import { type Env, IDLE_SWEEP_MS, LIMITS, SWEEP_MS, retentionDays, townConfig } from "./config";
import { MAX_FRAME_BYTES } from "./security";
import { saveReport } from "./reports";
import { activeSuspensions, moderateReport } from "./moderation";
import { InputError } from "./rules";
import { TownStore } from "./store";
import { COMPANION_ID } from "./companion";
import { type Frame, Town } from "./town";

export type ReportResult = { ok: true; id: string } | { ok: false; status: 422 | 429; code: string };

export class TownObject extends DurableObject<Env> {
  private readonly store: TownStore;
  private readonly suspensions = new Map<string, number>();
  private readonly town: Town;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.store = new TownStore(ctx.storage);
    // Finish old retention/deletion work before accepting events after an upgrade.
    void ctx.blockConcurrencyWhile(async () => {
      await this.store.purgeClosed();
      for (const ban of await activeSuspensions(env.DB, Date.now())) {
        this.suspensions.set(ban.guest_id, Date.parse(ban.expires_at));
        await this.town.restrict(ban.guest_id);
      }
    });
    this.town = new Town({
      store: this.store,
      send: (guestId, frame) => this.send(guestId, frame),
      now: () => Date.now(),
      newId: () => crypto.randomUUID(),
      saveReport: (record) => saveReport(env.DB, record),
      config: townConfig(env),
      suspendedUntil: (guestId) => this.suspensions.get(guestId) ?? null,
    });
  }

  async moderate(reportId: string, body: unknown) {
    // Serialize review and its cache update with socket events; D1 is authoritative.
    return this.ctx.blockConcurrencyWhile(async () => {
      try {
        const result = await moderateReport(this.env.DB, reportId, body, Date.now(), retentionDays(this.env));
        if (result.expiresAt) {
          this.suspensions.set(result.guestId, Date.parse(result.expiresAt));
          await this.town.restrict(result.guestId);
          this.send(result.guestId, { type: "lbt.error", code: "guest_suspended" });
        } else this.suspensions.delete(result.guestId);
        await this.ensureAlarm();
        return { ok: true as const, expires_at: result.expiresAt };
      } catch (err) {
        if (err instanceof InputError) return { ok: false as const, code: err.code };
        throw err;
      }
    });
  }

  // ── RPC from the Worker ────────────────────────────────────────────

  status() {
    return this.town.status();
  }

  /** Live numbers for the admin overview: public status plus open conversations. */
  async adminStats() {
    return {
      ...(await this.town.status()),
      conversations: (await this.store.activeConversationIds()).length,
      maintenance: await this.store.maintenance(),
    };
  }

  /** Toggle the maintenance pause. Turning it off pairs the waiting backlog
   *  right away instead of waiting for the next sweep. */
  async setMaintenance(on: boolean): Promise<{ maintenance: boolean }> {
    await this.store.setMaintenance(on);
    if (!on) await this.town.pairWaiting();
    return { maintenance: on };
  }

  /** Only queue profiles; never expose another pair's messages or active profiles. */
  async adminWaiting() {
    const cutoff = Date.now() - townConfig(this.env).offlineAfterMs;
    const queue = await this.store.listWaiting();
    const live = [];
    for (const w of queue) {
      const seen = await this.store.lastSeen(w.guestId);
      if (seen !== null && seen >= cutoff) live.push(w);
    }
    return live.map((w) => ({ guest_id: w.guestId, profile: w.profile, joined_at: new Date(w.joinedAt).toISOString() }));
  }

  /** Counts a guest-token request from `ip`; false once the hourly limit is used up. */
  async allowGuest(ip: string): Promise<boolean> {
    const allowed = await this.store.hit(`guest:ip:${ip}`, LIMITS.guestPerIpPerHour, 3600_000, Date.now());
    await this.ensureAlarm();
    return allowed;
  }

  /** Counts a feedback submission from `ip`; false once the hourly limit is used up. */
  async allowFeedback(ip: string): Promise<boolean> {
    const allowed = await this.store.hit(`feedback:ip:${ip}`, LIMITS.feedbackPerIpPerHour, 3600_000, Date.now());
    await this.ensureAlarm();
    return allowed;
  }

  adminSessionRevoked(fingerprint: string) {
    return this.store.adminSessionRevoked(fingerprint, Date.now());
  }
  async revokeAdminSession(fingerprint: string) {
    await this.store.revokeAdminSession(fingerprint, Date.now() + 12 * 3600_000);
    await this.ensureAlarm();
  }

  adminLoginBlocked(ip: string) {
    return this.store.limited(`admin:ip:${ip}`, 10, Date.now());
  }

  async allowAdminLogin(ip: string): Promise<boolean> {
    const allowed = await this.store.hit(`admin:ip:${ip}`, 10, 15 * 60_000, Date.now());
    await this.ensureAlarm();
    return allowed;
  }

  async report(guestId: string, reason: string, note: unknown): Promise<ReportResult> {
    const now = Date.now();
    if (!(await this.store.hit(`report:${guestId}`, LIMITS.reportsPerGuestPerHour, 3600_000, now))) {
      return { ok: false, status: 429, code: "too_many_reports" };
    }
    try {
      const id = await this.town.report(guestId, reason, note);
      await this.ensureAlarm();
      return { ok: true, id };
    } catch (err) {
      if (err instanceof InputError) return { ok: false, status: 422, code: err.code };
      throw err;
    }
  }

  // ── sockets ────────────────────────────────────────────────────────

  /** WebSocket upgrade, already authenticated by the Worker. */
  async fetch(request: Request): Promise<Response> {
    const guestId = request.headers.get("x-lbt-guest");
    const ip = request.headers.get("x-lbt-ip") ?? "unknown";
    const protocol = request.headers.get("x-lbt-protocol");
    if (!guestId || request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("expected websocket", { status: 426 });
    }
    const { 0: client, 1: server } = new WebSocketPair();
    // One administrator console at a time, and the newest one wins: a tab
    // left on duty or a phone that went to sleep (its socket can linger)
    // must never lock the operator out. The old console stops on 4409.
    if (!(await this.store.hit(`ws:ip:${ip}`, LIMITS.wsConnectPerIpPerMin, 60_000, Date.now())) ||
        (guestId !== COMPANION_ID && this.ctx.getWebSockets(guestId).filter(ws => ws.readyState === WebSocket.OPEN).length >= 2)) {
      server.accept();
      server.close(4429, "slow down");
      await this.ensureAlarm();
      return new Response(null, { status: 101, webSocket: client, headers: protocol ? { "Sec-WebSocket-Protocol": protocol } : undefined });
    }
    const replaced = guestId === COMPANION_ID ? this.ctx.getWebSockets(COMPANION_ID) : [];
    this.ctx.acceptWebSocket(server, [guestId]);
    for (const old of replaced) {
      try {
        old.close(4409, "replaced");
      } catch {
        /* already closed */
      }
    }
    const headers = protocol ? { "Sec-WebSocket-Protocol": protocol } : undefined;

    await this.town.connect(guestId);
    await this.ensureAlarm();
    return new Response(null, { status: 101, webSocket: client, headers });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    const guestId = this.ctx.getTags(ws)[0];
    if (!guestId) return;
    if (typeof message !== "string" || message.length > MAX_FRAME_BYTES ||
        new TextEncoder().encode(message).byteLength > MAX_FRAME_BYTES) {
      ws.close(1009, "invalid or oversized frame");
      return;
    }
    if (!(await this.store.hit(`frame:${guestId}`, 120, 60_000, Date.now()))) {
      ws.close(4429, "slow down");
      return;
    }
    let data: unknown;
    try {
      data = JSON.parse(message);
    } catch {
      return;
    }
    if (!data || typeof data !== "object") return;
    const frame = data as Record<string, unknown>;
    try {
      await this.dispatch(guestId, frame);
    } catch (err) {
      if (!(err instanceof InputError)) throw err;
      this.send(guestId, { type: "lbt.error", code: err.code });
    }
    await this.ensureAlarm();
  }

  private async dispatch(guestId: string, frame: Record<string, unknown>) {
    if (frame.type === "companion_invite") {
      if (guestId !== COMPANION_ID) throw new InputError("unauthorized");
      return this.town.inviteCompanion(frame.guest_id, frame.identity);
    }
    if (frame.type === "companion_answer") {
      if (typeof frame.accept !== "boolean") throw new InputError("invalid_answer");
      return this.town.answerCompanion(guestId, frame.id, frame.accept);
    }
    switch (frame.type) {
      case "heartbeat":
        return this.town.heartbeat(guestId);
      case "join":
        return this.town.join(guestId, frame.profile, frame.adult === true);
      case "cancel":
        return this.town.cancel(guestId);
      case "message":
        if (!(await this.store.hit(`msg:${guestId}`, LIMITS.messagesPerGuestPerMin, 60_000, Date.now()))) {
          throw new InputError("slow_down");
        }
        return this.town.sendMessage(guestId, frame.text);
      case "typing":
        return this.town.typing(guestId);
      case "extend":
        return this.town.extend(guestId);
      case "leave":
        return this.town.leave(guestId);
      default:
        return undefined;
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string) {
    try {
      ws.close(code === 1005 || code === 1006 ? 1000 : code, reason);
    } catch {
      /* already closed */
    }
    await this.onSocketGone(ws);
  }

  async webSocketError(ws: WebSocket) {
    await this.onSocketGone(ws);
  }

  private async onSocketGone(ws: WebSocket) {
    const guestId = this.ctx.getTags(ws)[0];
    if (!guestId) return;
    const stillOpen = this.ctx
      .getWebSockets(guestId)
      .some((other) => other !== ws && other.readyState === WebSocket.OPEN);
    if (!stillOpen) await this.town.disconnect(guestId);
    await this.ensureAlarm();
  }

  // ── sweep ──────────────────────────────────────────────────────────

  async alarm() {
    await this.town.sweep();
    await this.ensureAlarm();
  }

  private async ensureAlarm() {
    const { live, expiring } = await this.store.hasPendingWork();
    if (!live && !expiring) return;
    const want = Date.now() + (live ? SWEEP_MS : IDLE_SWEEP_MS);
    const current = await this.ctx.storage.getAlarm();
    if (current === null || current > want) await this.ctx.storage.setAlarm(want);
  }

  private send(guestId: string, frame: Frame) {
    const data = JSON.stringify(frame);
    for (const ws of this.ctx.getWebSockets(guestId)) {
      try {
        ws.send(data);
      } catch {
        /* closing socket */
      }
    }
  }
}
