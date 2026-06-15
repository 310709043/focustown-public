import { config } from "../config";
import { refreshTokens, tokenStore } from "../api/client";
import type { StreetUser } from "../api/types.gen";

export type PresenceStateValue = "on_street" | "in_room" | "offline";

export type WsMessage =
  | { type: "chat"; room_id: string; from: string; text: string }
  | {
      type: "match.proposed";
      match_id: string;
      /** Legacy field from ``MatchRealtimeLink`` (requester id, but the
       *  candidate sees them as the partner). The new waiting-pool
       *  payload sends ``partner_id`` instead — frontends accept either. */
      from?: string;
      /** New waiting-pool payload — id of the user the recipient is
       *  paired with. ``MatchRealtimeLink`` does not set this. */
      partner_id?: string;
      /** Character key of the partner, when known. */
      partner_character_key?: string | null;
      /** Whether the partner is a server-side bot. */
      partner_is_bot?: boolean;
      /** ``waiting_pool`` for human-human pairs, ``bot_fallback`` when
       *  the periodic sweep escalated us to a bot. Frontends generally
       *  don't need this; useful for telemetry. */
      via?: "waiting_pool" | "bot_fallback";
      compatibility: number;
    }
  | { type: "match.accepted"; match_id: string }
  | { type: "session.completed"; session_id: string }
  | { type: "presence"; user_id: string; status: string }
  | {
      type: "presence.changed";
      user_id: string;
      state?: PresenceStateValue;
      status?: string;
      // Phase 3: signals other clients to re-fetch /presence/street so they
      // pick up the new vehicle render_meta (we deliberately don't bloat the
      // WS frame with the full payload).
      equipment_changed?: boolean;
    }
  // Authoritative street snapshot delivered to the connecting socket
  // immediately after WS handshake + presence.connect. Eliminates the
  // race where the HTTP /presence/street poll could resolve before the
  // backend had registered this user, leaving them invisible until the
  // next 60s drift tick.
  | { type: "presence.snapshot"; users: StreetUser[] }
  | {
      type: "wallet.updated";
      currency_code: string;
      balance_minor: number;
      delta_minor: number;
      reason: string;
      metadata?: Record<string, number>;
    }
  // Phase 8: visitor session lifecycle. Broadcast on the ``room:{id}``
  // channel — VisitorPanel subscribes after sending the ``join`` frame
  // that follows a successful HTTP visit.
  | {
      type: "room.visitor_joined";
      room_id: string;
      user_id: string;
      joined_at: string;
    }
  | {
      type: "room.visitor_left";
      room_id: string;
      user_id: string;
    }
  // Phase 9: shared playback timeline. Broadcast on the ``room:{id}``
  // channel; subscribers compute the expected currentTime from
  // started_at_ms and drift-correct their local <audio>.
  | {
      type: "music.play";
      room_id: string;
      track_id: string | null;
      started_at_ms: number | null;
    }
  | {
      type: "music.pause";
      room_id: string;
      paused_at_ms: number;
    }
  | {
      type: "music.change";
      room_id: string;
      track_id: string;
      started_at_ms: number;
    }
  // Phase 8 (db+matching): match-room realtime lifecycle. Subscribed
  // via the explicit ``{op:"subscribe",channel:"room:{id}"}`` op so
  // the server validates participant membership before fanning out.
  | {
      type: "room.opened";
      room_id: string;
      match_id: string;
      requester_id: string;
      candidate_id: string;
    }
  | { type: "room.partner_joined"; room_id: string; user_id: string }
  | { type: "room.partner_left"; room_id: string; user_id: string }
  | { type: "room.ready"; room_id: string }
  | {
      type: "room.session_started";
      room_id: string;
      started_at: number;
      duration_seconds: number;
    }
  | {
      type: "room.timer_tick";
      room_id: string;
      elapsed_seconds: number;
      remaining_seconds: number;
    }
  | { type: "room.session_completed"; room_id: string }
  | { type: "room.ended"; room_id: string; reason: string }
  | {
      type: "error";
      code: string;
      channel?: string;
    }
  | { type: string; [k: string]: unknown };

type Listener = (msg: WsMessage) => void;

export type WsConnectionState = "idle" | "connecting" | "connected" | "reconnecting";
type StateListener = (state: WsConnectionState) => void;

export class RealtimeClient {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private stateListeners = new Set<StateListener>();
  private reconnectAttempts = 0;
  private intentionalClose = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _state: WsConnectionState = "idle";

  get state(): WsConnectionState {
    return this._state;
  }

  private setState(next: WsConnectionState) {
    if (this._state === next) return;
    this._state = next;
    for (const fn of this.stateListeners) fn(next);
  }

  onStateChange(fn: StateListener) {
    this.stateListeners.add(fn);
    return () => this.stateListeners.delete(fn);
  }

  connect() {
    if (this.ws && this.ws.readyState <= 1) return;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const token = tokenStore.load()?.access_token;
    if (!token) return;
    this.intentionalClose = false;
    this.setState(this.reconnectAttempts > 0 ? "reconnecting" : "connecting");
    // Send the JWT via Sec-WebSocket-Protocol so it never appears in the
    // URL (which proxies/ALBs log) — the backend pulls it from
    // websocket.scope.subprotocols and echoes the chosen one on accept().
    const url = `${config.wsBaseUrl}/api/v1/ws/connect`;
    const ws = new WebSocket(url, [`bearer.${token}`]);
    ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.setState("connected");
      // Pair with the close log so "still seeing [ws] close" reports can be
      // distinguished from "WS never opened" reports without DevTools dive.
      console.info("[ws] open");
    };
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data) as WsMessage;
        for (const fn of this.listeners) fn(msg);
      } catch {
        /* ignore */
      }
    };
    ws.onclose = (event) => {
      // Diagnostic for AWS dev — close code tells us which class of
      // failure we're seeing: 1006 = transport reject / proxy didn't
      // upgrade; 4401 = backend rejected the bearer subprotocol
      // (token missing or invalid; see backend/app/api/v1/ws/router.py);
      // 4429 = per-IP rate limit. Flat string keeps the code visible in
      // browser consoles that don't auto-expand objects (the "[ws] close
      // Object" report that obscured the actual code).
      const code = event?.code ?? "?";
      const reason = event?.reason ?? "";
      const clean = event?.wasClean ?? false;
      console.warn(
        `[ws] close code=${code} reason=${JSON.stringify(reason)} clean=${clean}`,
      );
      this.ws = null;
      if (this.intentionalClose) return;
      // 4401 = the backend rejected our JWT before ``accept()``. Without
      // a refresh, the reconnect loop keeps re-sending the same stale
      // token forever (apiFetch refreshes on HTTP 401, but WS has no
      // equivalent path). Mirror that recovery here: swap the access
      // token via the refresh endpoint, then reconnect immediately.
      if (event?.code === 4401) {
        void this.refreshAndReconnect();
        return;
      }
      this.scheduleReconnect();
    };
    ws.onerror = () => ws.close();
    this.ws = ws;
  }

  disconnect() {
    this.intentionalClose = true;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this.setState("idle");
  }

  send(payload: Record<string, unknown>) {
    if (this.ws?.readyState === 1) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  on(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private scheduleReconnect() {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
    }
    this.setState("reconnecting");
    const delay = Math.min(30_000, 500 * 2 ** this.reconnectAttempts++);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private async refreshAndReconnect(): Promise<void> {
    const refresh = tokenStore.load()?.refresh_token;
    if (!refresh) {
      // No refresh token to swap with — fall back to the normal
      // backoff. The user will recover the next time a HTTP call
      // succeeds and rehydrates the tokenStore.
      this.scheduleReconnect();
      return;
    }
    try {
      await refreshTokens(refresh);
      // Fresh tokens saved; reset the backoff so we reconnect promptly
      // (the next attempt is the one that should succeed).
      this.reconnectAttempts = 0;
      this.connect();
    } catch {
      // Refresh failed (refresh token itself is expired / revoked).
      // tokenStore is cleared by refreshTokens' caller path on the
      // HTTP side — for WS, just stop hammering: a subsequent sign-in
      // flow will rebuild the store and the next connect() will succeed.
      this.scheduleReconnect();
    }
  }
}

export const realtime = new RealtimeClient();
