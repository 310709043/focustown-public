/**
 * Anonymous guest tokens: HS256 JWTs with `type: "lbt_guest"` and a `g_`
 * subject, as issued by backend/app/core/security.py. Web Crypto only.
 */

export const GUEST_TOKEN_TYPE = "lbt_guest";
export const GUEST_ID_PREFIX = "g_";

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

export function newGuestId(): string {
  return GUEST_ID_PREFIX + crypto.randomUUID().replace(/-/g, "");
}

export async function createGuestToken(
  secret: string,
  guestId: string,
  nowMs: number,
  ttlHours: number,
): Promise<{ token: string; expiresAt: string }> {
  return createToken(secret, guestId, GUEST_TOKEN_TYPE, nowMs, ttlHours * 3600);
}

/** Socket-only credential, so the administrator's password never enters a URL/protocol. */
export async function createCompanionToken(secret: string, nowMs: number) {
  return createToken(secret, "companion", "lbt_companion", nowMs, 300);
}

async function createToken(secret: string, subject: string, type: string, nowMs: number, ttlSeconds: number) {
  const iat = Math.floor(nowMs / 1000);
  const exp = iat + ttlSeconds;
  const header = b64url(enc.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const payload = b64url(enc.encode(JSON.stringify({ sub: subject, iat, exp, type })));
  const signingInput = `${header}.${payload}`;
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(signingInput));
  return { token: `${signingInput}.${b64url(new Uint8Array(sig))}`, expiresAt: new Date(exp * 1000).toISOString() };
}

/** The guest id, or null for anything malformed, forged, expired or not a guest token. */
export async function verifyGuestToken(secret: string, token: string, nowMs: number): Promise<string | null> {
  const sub = await verifyToken(secret, token, nowMs, GUEST_TOKEN_TYPE);
  return sub?.startsWith(GUEST_ID_PREFIX) ? sub : null;
}

export async function verifyCompanionToken(secret: string, token: string, nowMs: number): Promise<boolean> {
  return (await verifyToken(secret, token, nowMs, "lbt_companion")) === "companion";
}

async function verifyToken(secret: string, token: string, nowMs: number, type: string): Promise<string | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, s] = parts as [string, string, string];
  try {
    const header = JSON.parse(new TextDecoder().decode(fromB64url(h))) as { alg?: unknown };
    if (header.alg !== "HS256") return null;
    const ok = await crypto.subtle.verify("HMAC", await hmacKey(secret), fromB64url(s), enc.encode(`${h}.${p}`));
    if (!ok) return null;
    const claims = JSON.parse(new TextDecoder().decode(fromB64url(p))) as Record<string, unknown>;
    if (claims.type !== type) return null;
    if (typeof claims.exp !== "number" || claims.exp * 1000 <= nowMs) return null;
    const sub = claims.sub;
    return typeof sub === "string" ? sub : null;
  } catch {
    return null;
  }
}
