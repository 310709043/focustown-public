import { ENERGIES, HEARTBEAT_MS, PREFERENCES } from "./constants";
import type { JoinRequest, LbtTransport, TransportEvent, TransportListener } from "./transport";
import type { EndReason, PeerProfile, ReportReason, TownStatus } from "./types";

/**
 * Live transport: anonymous guest token over HTTP, then one WebSocket that
 * carries the whole conversation. Reconnects with backoff; the server
 * replays an open conversation on reconnect.
 */

const TOKEN_KEY = "lbt.guest.v1";
/** Refresh the guest token when it has less than this left. */
const TOKEN_MARGIN_MS = 10 * 60 * 1000;
const OUTBOX_MAX = 20;
const OPEN = 1;
const END_REASONS: readonly EndReason[] = [
  "left",
  "partner_left",
  "timeout",
  "partner_disconnected",
  "reported",
];

interface StoredToken {
  token: string;
  expiresAt: number;
}

interface MinimalSocket {
  readyState: number;
  send(data: string): void;
  close(code?: number): void;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: { code: number }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
}

export interface LiveTransportOptions {
  apiBaseUrl: string;
  wsBaseUrl: string;
  fetchImpl?: typeof fetch;
  WebSocketImpl?: new (url: string, protocols?: string | string[]) => MinimalSocket;
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;
  now?: () => number;
}

function safeStorage(): Pick<Storage, "getItem" | "setItem" | "removeItem"> | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

function toProfile(raw: unknown): PeerProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const { nickname, energy, preference, role } = raw as Record<string, unknown>;
  if (typeof nickname !== "string") return null;
  if (!(ENERGIES as readonly unknown[]).includes(energy)) return null;
  if (!(PREFERENCES as readonly unknown[]).includes(preference)) return null;
  return { nickname, energy, preference, ...(role === "admin" ? { role } : {}) } as PeerProfile;
}

/** Server times → local `Date.now()` time, immune to client clock skew. */
function toLocal(endsAt: unknown, serverNow: unknown, now: number): number | null {
  if (typeof endsAt !== "string" || typeof serverNow !== "string") return null;
  const ends = Date.parse(endsAt);
  const server = Date.parse(serverNow);
  if (Number.isNaN(ends) || Number.isNaN(server)) return null;
  return now + (ends - server);
}

/** Map one server frame to a UI event; unknown or malformed frames → null. */
export function mapServerFrame(frame: unknown, now: number): TransportEvent | null {
  if (!frame || typeof frame !== "object") return null;
  const f = frame as Record<string, unknown>;
  switch (f.type) {
    case "lbt.waiting":
      return { type: "waiting" };
    case "lbt.companion_invite": {
      const expiresAt = toLocal(f.expires_at, f.server_now, now);
      return typeof f.id === "string" && expiresAt !== null && expiresAt > now
        ? { type: "companionInvite", id: f.id, expiresAt } : null;
    }
    case "lbt.companion_cleared":
      return typeof f.id === "string" ? { type: "companionCleared", id: f.id } : null;
    case "lbt.matched": {
      const me = toProfile(f.me);
      const partner = toProfile(f.partner);
      const endsAt = toLocal(f.ends_at, f.server_now, now);
      if (!me || !partner || endsAt === null) return null;
      const grace = typeof f.grace_seconds === "number" ? f.grace_seconds : 60;
      return { type: "matched", me, partner, simulated: false, endsAt, graceSeconds: grace };
    }
    case "lbt.message":
      if (typeof f.id !== "string" || typeof f.text !== "string") return null;
      if (f.from !== "me" && f.from !== "partner") return null;
      return { type: "message", id: f.id, from: f.from, text: f.text };
    case "lbt.typing":
      return { type: "typing" };
    case "lbt.extend_requested":
      if (f.by !== "me" && f.by !== "partner") return null;
      return { type: "extendRequested", by: f.by };
    case "lbt.extended": {
      const endsAt = toLocal(f.ends_at, f.server_now, now);
      return endsAt === null ? null : { type: "extended", endsAt };
    }
    case "lbt.ended":
      return (END_REASONS as readonly unknown[]).includes(f.reason)
        ? { type: "ended", reason: f.reason as EndReason }
        : null;
    case "lbt.idle":
      return { type: "idle" };
    case "lbt.error":
      return { type: "error", code: typeof f.code === "string" ? f.code : "generic" };
    default:
      return null;
  }
}

function toStatus(raw: unknown): TownStatus | null {
  if (!raw || typeof raw !== "object") return null;
  const { online, waiting, open, hours } = raw as Record<string, unknown>;
  if (typeof online !== "number" || typeof waiting !== "number" || typeof open !== "boolean") {
    return null;
  }
  return { online, waiting, open, hours: typeof hours === "string" ? hours : "" };
}

export function createLiveTransport(options: LiveTransportOptions): LbtTransport {
  const fetcher = options.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const Socket =
    options.WebSocketImpl ??
    (WebSocket as unknown as new (url: string, protocols?: string | string[]) => MinimalSocket);
  const storage = options.storage === undefined ? safeStorage() : options.storage;
  const now = options.now ?? (() => Date.now());
  const api = options.apiBaseUrl.replace(/\/$/, "");
  const wsBase = options.wsBaseUrl.replace(/\/$/, "");

  let listener: TransportListener | null = null;
  let socket: MinimalSocket | null = null;
  let running = false;
  let attempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  const outbox: string[] = [];

  const emit = (event: TransportEvent) => listener?.(event);

  function readToken(): StoredToken | null {
    try {
      const raw = storage?.getItem(TOKEN_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as StoredToken;
      if (typeof parsed.token !== "string" || typeof parsed.expiresAt !== "number") return null;
      return parsed.expiresAt - now() > TOKEN_MARGIN_MS ? parsed : null;
    } catch {
      return null;
    }
  }

  function forgetToken() {
    try {
      storage?.removeItem(TOKEN_KEY);
    } catch {
      /* storage unavailable */
    }
  }

  async function guestToken(): Promise<string> {
    const cached = readToken();
    if (cached) return cached.token;
    const res = await fetcher(`${api}/api/v1/lbt/guest`, { method: "POST" });
    if (!res.ok) throw new Error(`guest_${res.status}`);
    const body = (await res.json()) as { token?: unknown; expires_at?: unknown };
    if (typeof body.token !== "string") throw new Error("guest_malformed");
    const expiresAt = typeof body.expires_at === "string" ? Date.parse(body.expires_at) : NaN;
    try {
      storage?.setItem(
        TOKEN_KEY,
        JSON.stringify({ token: body.token, expiresAt: Number.isNaN(expiresAt) ? now() : expiresAt }),
      );
    } catch {
      /* storage unavailable: keep using the token for this page only */
    }
    return body.token;
  }

  function scheduleReconnect(slow: boolean) {
    clearTimeout(reconnectTimer);
    const delay = Math.min(15_000, 1000 * 2 ** attempt) * (slow ? 2 : 1);
    attempt += 1;
    reconnectTimer = setTimeout(() => void connect(), delay);
  }

  async function connect() {
    if (!running) return;
    emit({ type: "connection", state: "connecting" });
    let token: string;
    try {
      token = await guestToken();
    } catch {
      emit({ type: "connection", state: "offline" });
      scheduleReconnect(false);
      return;
    }
    if (!running) return;
    const ws = new Socket(`${wsBase}/api/v1/lbt/ws`, [`bearer.${token}`]);
    socket = ws;
    ws.onopen = () => {
      attempt = 0;
      emit({ type: "connection", state: "open" });
      while (outbox.length > 0 && ws.readyState === OPEN) ws.send(outbox.shift() as string);
      clearInterval(heartbeatTimer);
      heartbeatTimer = setInterval(() => {
        if (ws.readyState === OPEN) ws.send(JSON.stringify({ type: "heartbeat" }));
      }, HEARTBEAT_MS);
    };
    ws.onmessage = (ev) => {
      if (typeof ev.data !== "string") return;
      let frame: unknown;
      try {
        frame = JSON.parse(ev.data);
      } catch {
        return;
      }
      const event = mapServerFrame(frame, now());
      if (event?.type === "ended" || event?.type === "idle") outbox.length = 0;
      if (event) emit(event);
    };
    ws.onerror = () => {
      /* onclose follows and handles reconnect */
    };
    ws.onclose = (ev) => {
      clearInterval(heartbeatTimer);
      if (socket === ws) socket = null;
      if (!running) return;
      emit({ type: "connection", state: "offline" });
      if (ev.code === 4401) forgetToken();
      scheduleReconnect(ev.code === 4429);
    };
  }

  function send(frame: Record<string, unknown>, { queue }: { queue: boolean }) {
    const data = JSON.stringify(frame);
    if (socket && socket.readyState === OPEN) {
      socket.send(data);
    } else if (queue && outbox.length < OUTBOX_MAX) {
      outbox.push(data);
    }
  }

  return {
    mode: "live",
    start(next) {
      listener = next;
      running = true;
      void connect();
      return () => {
        running = false;
        listener = null;
        clearTimeout(reconnectTimer);
        clearInterval(heartbeatTimer);
        outbox.length = 0;
        socket?.close(1000);
        socket = null;
      };
    },
    join(request: JoinRequest) {
      const { nickname, energy, preference, adult } = request;
      send({ type: "join", profile: { nickname, energy, preference }, adult }, { queue: true });
    },
    cancel: () => send({ type: "cancel" }, { queue: true }),
    answerCompanion: (id, accept) => send({ type: "companion_answer", id, accept }, { queue: false }),
    send: (text) => send({ type: "message", text }, { queue: true }),
    typing: () => send({ type: "typing" }, { queue: false }),
    extend: () => send({ type: "extend" }, { queue: true }),
    leave: () => {
      outbox.length = 0;
      send({ type: "leave" }, { queue: true });
    },
    async report(reason: ReportReason, note: string) {
      const token = await guestToken();
      const res = await fetcher(`${api}/api/v1/lbt/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason, note: note.trim() || null }),
      });
      if (!res.ok) throw new Error(`report_${res.status}`);
      return "sent";
    },
    async status() {
      try {
        const res = await fetcher(`${api}/api/v1/lbt/status`);
        if (!res.ok) return null;
        return toStatus(await res.json());
      } catch {
        return null;
      }
    },
  };
}
