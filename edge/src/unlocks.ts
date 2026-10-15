/**
 * Unlock codes for paid cosmetic extras (the koi pond stage scene first).
 * The town stays anonymous: there are no accounts and no payment data here.
 * The owner sells the extra elsewhere (e.g. Buy Me a Coffee, Gumroad),
 * generates a code in /admin and gives it to the buyer, who enters it on
 * /unlock. A code works on up to `max_devices` devices; each device gets a
 * signed token naming the code, and checks it now and then so a revoked
 * code (a refund) stops unlocking.
 *
 * Codes are 12 characters from an alphabet without look-alikes (no 0/O,
 * 1/I/L), about 59 bits, shown as XXXX-XXXX-XXXX. Only their SHA-256 is
 * stored. Redeeming is rate-limited per IP in the Town Durable Object.
 */
import { InputError, cleanText } from "./rules";

export const UNLOCK_ITEMS = ["koi-pond"] as const;
export type UnlockItem = (typeof UNLOCK_ITEMS)[number];
export const DEFAULT_MAX_DEVICES = 3;
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 12;
const TOKEN_PREFIX = "u1";
const enc = new TextEncoder();

export interface UnlockCodeRow {
  id: string;
  hint: string;
  item: UnlockItem;
  note: string;
  maxDevices: number;
  redemptions: number;
  revoked: boolean;
  createdAt: string;
  lastRedeemedAt: string | null;
}

export type RedeemResult =
  | { ok: true; token: string; items: UnlockItem[] }
  | { ok: false; status: 409 | 422; code: "invalid_code" | "code_used_up" };

const isItem = (v: unknown): v is UnlockItem => (UNLOCK_ITEMS as readonly unknown[]).includes(v);

const hex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) => {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

/** A fresh random code, grouped for reading aloud or typing: XXXX-XXXX-XXXX. */
export function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH * 2));
  let out = "";
  // Rejection sampling keeps every character equally likely.
  for (const b of bytes) {
    if (out.length === CODE_LENGTH) break;
    if (b < 248) out += ALPHABET[b % ALPHABET.length];
  }
  while (out.length < CODE_LENGTH) out += ALPHABET[crypto.getRandomValues(new Uint8Array(1))[0]! % ALPHABET.length];
  return out.match(/.{4}/g)!.join("-");
}

/** The code as stored (12 letters/digits), or null when it cannot be one of ours. */
export function normalizeCode(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 64) return null;
  const code = raw.toUpperCase().replace(/[\s-]/g, "");
  if (code.length !== CODE_LENGTH) return null;
  for (const ch of code) if (!ALPHABET.includes(ch)) return null;
  return code;
}

const hashCode = async (code: string) => hex(await crypto.subtle.digest("SHA-256", enc.encode(`lbt-unlock:${code}`)));

async function signingKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", enc.encode(`${secret}:lbt-unlock`), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

async function signToken(secret: string, codeId: string, nowMs: number): Promise<string> {
  const payload = b64url(enc.encode(JSON.stringify({ c: codeId, t: Math.floor(nowMs / 1000) })));
  const input = `${TOKEN_PREFIX}.${payload}`;
  const sig = await crypto.subtle.sign("HMAC", await signingKey(secret), enc.encode(input));
  return `${input}.${b64url(new Uint8Array(sig))}`;
}

/** The code id a device token names, or null when it is malformed or not ours. */
async function tokenCodeId(secret: string, token: unknown): Promise<string | null> {
  if (typeof token !== "string" || token.length > 512) return null;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== TOKEN_PREFIX) return null;
  try {
    const ok = await crypto.subtle.verify("HMAC", await signingKey(secret), fromB64url(parts[2]!), enc.encode(`${parts[0]}.${parts[1]}`));
    if (!ok) return null;
    const { c } = JSON.parse(new TextDecoder().decode(fromB64url(parts[1]!))) as { c?: unknown };
    return typeof c === "string" ? c : null;
  } catch {
    return null;
  }
}

function toRow(r: Record<string, unknown>): UnlockCodeRow {
  return {
    id: String(r.id),
    hint: String(r.hint),
    item: isItem(r.item) ? r.item : UNLOCK_ITEMS[0],
    note: String(r.note ?? ""),
    maxDevices: Number(r.max_devices),
    redemptions: Number(r.redemptions),
    revoked: Number(r.revoked) === 1,
    createdAt: String(r.created_at),
    lastRedeemedAt: typeof r.last_redeemed_at === "string" ? r.last_redeemed_at : null,
  };
}

export interface CreateCodesInput {
  item: UnlockItem;
  count: number;
  note: string;
  maxDevices: number;
}

/** Validate the admin form: a known item, 1–50 codes, 1–10 devices each, a short note. */
export function parseCreateCodes(raw: unknown): CreateCodesInput {
  const body = (raw ?? {}) as Record<string, unknown>;
  if (!isItem(body.item)) throw new InputError("invalid_item");
  const count = Number(body.count ?? 1);
  if (!Number.isInteger(count) || count < 1 || count > 50) throw new InputError("invalid_count");
  const maxDevices = Number(body.maxDevices ?? DEFAULT_MAX_DEVICES);
  if (!Number.isInteger(maxDevices) || maxDevices < 1 || maxDevices > 10) throw new InputError("invalid_devices");
  const note = typeof body.note === "string" ? cleanText(body.note, 60).trim() : "";
  return { item: body.item, count, note, maxDevices };
}

/** Make `count` new codes; the plain codes are returned once and never stored. */
export async function createCodes(db: D1Database, input: CreateCodesInput, nowMs: number): Promise<string[]> {
  const created = new Date(nowMs).toISOString();
  const codes: string[] = [];
  for (let i = 0; i < input.count; i++) {
    const code = newCode();
    const plain = code.replace(/-/g, "");
    await db
      .prepare(
        `INSERT INTO lbt_unlock_codes (id, code_hash, hint, item, note, max_devices, redemptions, revoked, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?)`,
      )
      .bind(crypto.randomUUID(), await hashCode(plain), plain.slice(0, 4), input.item, input.note, input.maxDevices, created)
      .run();
    codes.push(code);
  }
  return codes;
}

export async function listCodes(db: D1Database, limit = 200): Promise<UnlockCodeRow[]> {
  const rows = await db.prepare(`SELECT * FROM lbt_unlock_codes ORDER BY created_at DESC, rowid DESC LIMIT ?`).bind(limit).all();
  return (rows.results as Record<string, unknown>[]).map(toRow);
}

export async function revokeCode(db: D1Database, id: string): Promise<boolean> {
  const r = await db.prepare(`UPDATE lbt_unlock_codes SET revoked = 1 WHERE id = ?`).bind(id).run();
  return (r.meta.changes ?? 0) > 0;
}

/** Redeem a code on one more device. */
export async function redeemCode(db: D1Database, secret: string, raw: unknown, nowMs: number): Promise<RedeemResult> {
  const code = normalizeCode(raw);
  if (!code) return { ok: false, status: 422, code: "invalid_code" };
  const row = await db.prepare(`SELECT * FROM lbt_unlock_codes WHERE code_hash = ?`).bind(await hashCode(code)).first<Record<string, unknown>>();
  if (!row || Number(row.revoked) === 1) return { ok: false, status: 422, code: "invalid_code" };
  // One statement, so two devices racing cannot both take the last slot.
  const taken = await db
    .prepare(`UPDATE lbt_unlock_codes SET redemptions = redemptions + 1, last_redeemed_at = ? WHERE id = ? AND revoked = 0 AND redemptions < max_devices`)
    .bind(new Date(nowMs).toISOString(), row.id)
    .run();
  if ((taken.meta.changes ?? 0) === 0) return { ok: false, status: 409, code: "code_used_up" };
  const { item } = toRow(row);
  return { ok: true, token: await signToken(secret, String(row.id), nowMs), items: [item] };
}

/** What a device token still unlocks: its code's item, or nothing once the code is revoked. */
export async function verifyUnlock(db: D1Database, secret: string, token: unknown): Promise<UnlockItem[]> {
  const id = await tokenCodeId(secret, token);
  if (!id) return [];
  const row = await db.prepare(`SELECT item, revoked FROM lbt_unlock_codes WHERE id = ?`).bind(id).first<Record<string, unknown>>();
  if (!row || Number(row.revoked) === 1 || !isItem(row.item)) return [];
  return [row.item];
}
