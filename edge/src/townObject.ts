/**
 * The whole town lives in one Durable Object: it holds every guest's
 * WebSocket (hibernation API, tagged with the guest id) and the session
 * state, and runs events one at a time, so pairing and extension votes
 * need no locks. An alarm sweeps every few seconds while anyone is
 * waiting or chatting.
 */
import { DurableObject } from "cloudflare:workers";

import { type Env, IDLE_SWEEP_MS, LIMITS, SWEEP_MS, townConfig } from "./config";
import { saveReport } from "./reports";
import { InputError } from "./rules";
import { TownStore } from "./store";
import { COMPANION_ID } from "./companion";
import { type Frame, Town } from "./town";

export type ReportResult = { ok: true; id: string } | { ok: false; status: 422 | 429; code: string };

export class TownObject extends DurableObject<Env> {
  private readonly store: TownStore;
  private readonly town: Town;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.store = new TownStore(ctx.storage);
    this.town = new Town({
      store: this.store,
      send: (guestId, frame) => this.send(guestId, frame),
      now: () => Date.now(),
      newId: () => crypto.randomUUID(),
      saveReport: (record) => saveReport(env.DB, record),
      config: townConfig(env),
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
    };
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
  allowGuest(ip: string): Promise<boolean> {
    return this.store.hit(`guest:ip:${ip}`, LIMITS.guestPerIpPerHour, 3600_000, Date.now());
  }

  /** Counts a feedback submission from `ip`; false once the hourly limit is used up. */
  allowFeedback(ip: string): Promise<boolean> {
    return this.store.hit(`feedback:ip:${ip}`, LIMITS.feedbackPerIpPerHour, 3600_000, Date.now());
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
    if (guestId === COMPANION_ID && this.ctx.getWebSockets(COMPANION_ID).some((ws) => ws.readyState === WebSocket.OPEN)) {
      return new Response("companion already connected", { status: 409 });
    }
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server, [guestId]);
    const headers = protocol ? { "Sec-WebSocket-Protocol": protocol } : undefined;

    if (!(await this.store.hit(`ws:ip:${ip}`, LIMITS.wsConnectPerIpPerMin, 60_000, Date.now()))) {
      server.close(4429, "slow down");
      return new Response(null, { status: 101, webSocket: client, headers });
    }
    await this.town.connect(guestId);
    await this.ensureAlarm();
    return new Response(null, { status: 101, webSocket: client, headers });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    const guestId = this.ctx.getTags(ws)[0];
    if (!guestId || typeof message !== "string") return;
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
      return this.town.inviteCompanion(frame.guest_id);
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
