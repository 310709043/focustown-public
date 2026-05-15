import { config } from "../config";
import { tokenStore } from "../api/client";

export type PresenceStateValue = "on_street" | "in_room" | "offline";

export type WsMessage =
  | { type: "chat"; room_id: string; from: string; text: string }
  | { type: "match.proposed"; match_id: string; from: string; compatibility: number }
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
  | {
      type: "wallet.updated";
      currency_code: string;
      balance_minor: number;
      delta_minor: number;
      reason: string;
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
  | { type: string; [k: string]: unknown };

type Listener = (msg: WsMessage) => void;

export class RealtimeClient {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private reconnectAttempts = 0;
  private intentionalClose = false;

  connect() {
    if (this.ws && this.ws.readyState <= 1) return;
    const token = tokenStore.load()?.access_token;
    if (!token) return;
    this.intentionalClose = false;
    const url = `${config.wsBaseUrl}/api/v1/ws/connect?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(url);
    ws.onopen = () => {
      this.reconnectAttempts = 0;
    };
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data) as WsMessage;
        for (const fn of this.listeners) fn(msg);
      } catch {
        /* ignore */
      }
    };
    ws.onclose = () => {
      this.ws = null;
      if (!this.intentionalClose) this.scheduleReconnect();
    };
    ws.onerror = () => ws.close();
    this.ws = ws;
  }

  disconnect() {
    this.intentionalClose = true;
    this.ws?.close();
    this.ws = null;
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
    const delay = Math.min(30_000, 500 * 2 ** this.reconnectAttempts++);
    setTimeout(() => this.connect(), delay);
  }
}

export const realtime = new RealtimeClient();
