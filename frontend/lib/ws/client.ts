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
    }
  | {
      type: "wallet.updated";
      currency_code: string;
      balance_minor: number;
      delta_minor: number;
      reason: string;
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
