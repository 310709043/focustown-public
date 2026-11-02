/**
 * Paid extras unlocked on this device (see edge/src/unlocks.ts). A code
 * bought elsewhere is redeemed once on /unlock; the device keeps the signed
 * token it gets back, nothing else, and asks the API about once a day
 * whether it still holds, so a refunded (revoked) code stops unlocking.
 * The extras are cosmetic and drawn in the browser, so this is a courtesy
 * lock, not DRM; it never touches chat or matching.
 */
import { create } from "zustand";

export type UnlockItem = "koi-pond";
const ITEMS: readonly UnlockItem[] = ["koi-pond"];
const KEY = "lbt-unlock";
const CHECK_EVERY_MS = 24 * 3_600_000;

interface Saved {
  token: string;
  items: UnlockItem[];
  checkedAt: number;
  expiresAt: number | null;
}

export type RedeemOutcome = "ok" | "invalid_code" | "code_used_up" | "code_expired" | "too_many" | "offline";

const isItem = (v: unknown): v is UnlockItem => (ITEMS as readonly unknown[]).includes(v);
const items = (raw: unknown): UnlockItem[] => (Array.isArray(raw) ? raw.filter(isItem) : []);
const expiry = (raw: unknown): number | null => {
  const time = typeof raw === "string" ? Date.parse(raw) : typeof raw === "number" ? raw : NaN;
  return Number.isFinite(time) && time > 0 ? time : null;
};

function read(): Saved | null {
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) ?? "null") as Partial<Saved> | null;
    if (!raw || typeof raw.token !== "string") return null;
    return { token: raw.token, items: items(raw.items), checkedAt: Number(raw.checkedAt) || 0, expiresAt: expiry(raw.expiresAt) };
  } catch {
    return null;
  }
}

function write(saved: Saved | null) {
  try {
    if (saved) window.localStorage.setItem(KEY, JSON.stringify(saved));
    else window.localStorage.removeItem(KEY);
  } catch {
    /* private mode: the unlock lasts for this visit only */
  }
}

const post = (apiBaseUrl: string, path: string, body: unknown, fetchImpl: typeof fetch) =>
  fetchImpl(`${apiBaseUrl.replace(/\/$/, "")}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

interface UnlockState {
  items: UnlockItem[];
  loaded: boolean;
  expiresAt: number | null;
  expire: (now?: number) => void;
  /** Read this device's unlocks and, at most once a day, check they still hold. */
  load: (apiBaseUrl: string, fetchImpl?: typeof fetch, now?: number) => Promise<void>;
  redeem: (apiBaseUrl: string, code: string, fetchImpl?: typeof fetch, now?: number) => Promise<RedeemOutcome>;
}

export const useUnlocks = create<UnlockState>((set, get) => ({
  items: [],
  loaded: false,
  expiresAt: null,
  expire(now = Date.now()) {
    const deadline = get().expiresAt;
    if (deadline === null || now < deadline) return;
    write(null);
    set({ items: [], expiresAt: null });
  },
  async load(apiBaseUrl, fetchImpl = fetch, now = Date.now()) {
    get().expire(now);
    if (get().loaded) return;
    const saved = read();
    if (saved?.expiresAt !== null && saved?.expiresAt !== undefined && saved.expiresAt <= now) {
      write(null);
      set({ loaded: true, items: [], expiresAt: null });
      return;
    }
    set({ loaded: true, items: saved?.items ?? [], expiresAt: saved?.expiresAt ?? null });
    if (!saved || now - saved.checkedAt < CHECK_EVERY_MS) return;
    try {
      const res = await post(apiBaseUrl, "/api/v1/lbt/unlock/verify", { token: saved.token }, fetchImpl);
      if (!res.ok) return;
      const body = (await res.json()) as { items?: unknown; expires_at?: unknown };
      const expiresAt = expiry(body.expires_at);
      const still = expiresAt !== null && expiresAt <= now ? [] : items(body.items);
      write(still.length ? { ...saved, items: still, checkedAt: now, expiresAt } : null);
      set({ items: still, expiresAt: still.length ? expiresAt : null });
    } catch {
      /* offline: keep what this device had; check again next visit */
    }
  },
  async redeem(apiBaseUrl, code, fetchImpl = fetch, now = Date.now()) {
    try {
      const res = await post(apiBaseUrl, "/api/v1/lbt/unlock", { code }, fetchImpl);
      if (res.status === 429) return "too_many";
      const body = (await res.json()) as { token?: unknown; items?: unknown; expires_at?: unknown; error?: { code?: unknown } };
      if (!res.ok || typeof body.token !== "string") {
        const code = body.error?.code;
        return code === "code_used_up" || code === "code_expired" ? code : "invalid_code";
      }
      const expiresAt = expiry(body.expires_at);
      if (expiresAt !== null && expiresAt <= now) return "code_expired";
      const unlocked = Array.from(new Set([...get().items, ...items(body.items)]));
      write({ token: body.token, items: unlocked, checkedAt: now, expiresAt });
      set({ items: unlocked, loaded: true, expiresAt });
      return "ok";
    } catch {
      return "offline";
    }
  },
}));
