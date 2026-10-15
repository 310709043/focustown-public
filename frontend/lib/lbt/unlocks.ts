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
}

export type RedeemOutcome = "ok" | "invalid_code" | "code_used_up" | "too_many" | "offline";

const isItem = (v: unknown): v is UnlockItem => (ITEMS as readonly unknown[]).includes(v);
const items = (raw: unknown): UnlockItem[] => (Array.isArray(raw) ? raw.filter(isItem) : []);

function read(): Saved | null {
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) ?? "null") as Partial<Saved> | null;
    if (!raw || typeof raw.token !== "string") return null;
    return { token: raw.token, items: items(raw.items), checkedAt: Number(raw.checkedAt) || 0 };
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
  /** Read this device's unlocks and, at most once a day, check they still hold. */
  load: (apiBaseUrl: string, fetchImpl?: typeof fetch, now?: number) => Promise<void>;
  redeem: (apiBaseUrl: string, code: string, fetchImpl?: typeof fetch, now?: number) => Promise<RedeemOutcome>;
}

export const useUnlocks = create<UnlockState>((set, get) => ({
  items: [],
  loaded: false,
  async load(apiBaseUrl, fetchImpl = fetch, now = Date.now()) {
    if (get().loaded) return;
    const saved = read();
    set({ loaded: true, items: saved?.items ?? [] });
    if (!saved || now - saved.checkedAt < CHECK_EVERY_MS) return;
    try {
      const res = await post(apiBaseUrl, "/api/v1/lbt/unlock/verify", { token: saved.token }, fetchImpl);
      if (!res.ok) return;
      const still = items(((await res.json()) as { items?: unknown }).items);
      write(still.length ? { ...saved, items: still, checkedAt: now } : null);
      set({ items: still });
    } catch {
      /* offline: keep what this device had; check again next visit */
    }
  },
  async redeem(apiBaseUrl, code, fetchImpl = fetch, now = Date.now()) {
    try {
      const res = await post(apiBaseUrl, "/api/v1/lbt/unlock", { code }, fetchImpl);
      if (res.status === 429) return "too_many";
      const body = (await res.json()) as { token?: unknown; items?: unknown; error?: { code?: unknown } };
      if (!res.ok || typeof body.token !== "string") return body.error?.code === "code_used_up" ? "code_used_up" : "invalid_code";
      const unlocked = Array.from(new Set([...get().items, ...items(body.items)]));
      write({ token: body.token, items: unlocked, checkedAt: now });
      set({ items: unlocked, loaded: true });
      return "ok";
    } catch {
      return "offline";
    }
  },
}));
