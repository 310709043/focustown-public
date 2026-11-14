/**
 * Paid extras unlocked on this device (see edge/src/unlocks.ts). A code
 * bought elsewhere is redeemed once on /unlock; the device keeps the signed
 * token it gets back, nothing else, and asks the API about once a day
 * whether it still holds, so a refunded (revoked) code stops unlocking.
 * Each redeemed code keeps its own token, so a device that bought the pond
 * and later a style keeps both (an older single-token save is read as one).
 * The extras are cosmetic and drawn in the browser, so this is a courtesy
 * lock, not DRM; it never touches chat or matching.
 */
import { create } from "zustand";

/** Keep in step with UNLOCK_ITEMS in edge/src/unlocks.ts. */
export const UNLOCK_ITEMS = ["koi-pond", "rain-town", "style-milktea", "style-mint", "style-sakura", "style-pixel"] as const;
export type UnlockItem = (typeof UNLOCK_ITEMS)[number];
const KEY = "lbt-unlock";
const CHECK_EVERY_MS = 24 * 3_600_000;

/** One redeemed code on this device. */
interface Entry {
  token: string;
  items: UnlockItem[];
  expiresAt: number | null;
}

interface Saved {
  entries: Entry[];
  checkedAt: number;
}

export type RedeemOutcome = "ok" | "invalid_code" | "code_used_up" | "code_expired" | "too_many" | "offline";

const isItem = (v: unknown): v is UnlockItem => (UNLOCK_ITEMS as readonly unknown[]).includes(v);
const items = (raw: unknown): UnlockItem[] => (Array.isArray(raw) ? raw.filter(isItem) : []);
const expiry = (raw: unknown): number | null => {
  const time = typeof raw === "string" ? Date.parse(raw) : typeof raw === "number" ? raw : NaN;
  return Number.isFinite(time) && time > 0 ? time : null;
};

function entry(raw: unknown): Entry | null {
  const r = raw as Partial<Record<keyof Entry, unknown>> | null;
  if (!r || typeof r.token !== "string") return null;
  return { token: r.token, items: items(r.items), expiresAt: expiry(r.expiresAt) };
}

function read(): Saved | null {
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) ?? "null") as Record<string, unknown> | null;
    if (!raw) return null;
    const checkedAt = Number(raw.checkedAt) || 0;
    // before several codes per device: { token, items, checkedAt, expiresAt }
    if (typeof raw.token === "string") {
      const one = entry(raw);
      return one ? { entries: [one], checkedAt } : null;
    }
    const entries = Array.isArray(raw.entries) ? raw.entries.map(entry).filter((e): e is Entry => e !== null) : [];
    return entries.length ? { entries, checkedAt } : null;
  } catch {
    return null;
  }
}

function write(saved: Saved | null) {
  try {
    if (saved && saved.entries.length) window.localStorage.setItem(KEY, JSON.stringify(saved));
    else window.localStorage.removeItem(KEY);
  } catch {
    /* private mode: the unlock lasts for this visit only */
  }
}

const live = (entries: Entry[], now: number) => entries.filter((e) => e.expiresAt === null || e.expiresAt > now);
const unionOf = (entries: Entry[]) => Array.from(new Set(entries.flatMap((e) => e.items)));
/** The soonest deadline among promotional codes, for useUnlockExpiry. */
const soonest = (entries: Entry[]) => {
  const times = entries.map((e) => e.expiresAt).filter((t): t is number => t !== null);
  return times.length ? Math.min(...times) : null;
};
const view = (entries: Entry[]) => ({ items: unionOf(entries), expiresAt: soonest(entries) });

const post = (apiBaseUrl: string, path: string, body: unknown, fetchImpl: typeof fetch) =>
  fetchImpl(`${apiBaseUrl.replace(/\/$/, "")}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

/** Ask the town whether one code still holds; null when it cannot say (offline, error). */
async function check(apiBaseUrl: string, e: Entry, fetchImpl: typeof fetch, now: number): Promise<Entry | null | "keep"> {
  try {
    const res = await post(apiBaseUrl, "/api/v1/lbt/unlock/verify", { token: e.token }, fetchImpl);
    if (!res.ok) return "keep";
    const body = (await res.json()) as { items?: unknown; expires_at?: unknown };
    const expiresAt = expiry(body.expires_at);
    const still = expiresAt !== null && expiresAt <= now ? [] : items(body.items);
    return still.length ? { ...e, items: still, expiresAt } : null;
  } catch {
    return "keep";
  }
}

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
    const saved = read();
    const kept = live(saved?.entries ?? [], now);
    write(saved ? { ...saved, entries: kept } : null);
    set(view(kept));
  },
  async load(apiBaseUrl, fetchImpl = fetch, now = Date.now()) {
    get().expire(now);
    if (get().loaded) return;
    const saved = read();
    const kept = live(saved?.entries ?? [], now);
    if (saved && kept.length !== saved.entries.length) write({ ...saved, entries: kept });
    set({ loaded: true, ...view(kept) });
    if (!saved || !kept.length || now - saved.checkedAt < CHECK_EVERY_MS) return;
    const checked = await Promise.all(kept.map((e) => check(apiBaseUrl, e, fetchImpl, now)));
    const after = checked.flatMap((c, i) => (c === "keep" ? [kept[i]] : c ? [c] : []));
    // the day counts as checked only when the town answered for every code
    const answered = checked.every((c) => c !== "keep");
    write({ entries: after, checkedAt: answered ? now : saved.checkedAt });
    set(view(after));
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
      const saved = read();
      const others = (saved?.entries ?? []).filter((e) => e.token !== body.token);
      const entries = [...others, { token: body.token, items: items(body.items), expiresAt }];
      write({ entries, checkedAt: saved?.checkedAt ?? now });
      set({ loaded: true, ...view(entries) });
      return "ok";
    } catch {
      return "offline";
    }
  },
}));
