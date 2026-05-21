/**
 * HS256 JWT verification using Web Crypto. Mirrors the contract issued
 * by the backend's AudioTokenService — every change to the claim set
 * must be made in both places (see audio_token_service.py).
 *
 * Workers have no Node `crypto` module, so we cannot reuse jose / jsonwebtoken.
 */

export interface AudioClaims {
  sub: string;
  tid: string;
  key: string;
  iat: number;
  exp: number;
}

export class JwtError extends Error {}

export async function verifyAudioToken(
  token: string,
  secret: string,
  nowSeconds: number,
): Promise<AudioClaims> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new JwtError("malformed_jwt");
  const [headerB64, payloadB64, sigB64] = parts;

  const header = decodeJsonSegment(headerB64);
  if (header.alg !== "HS256" || header.typ !== "JWT") {
    throw new JwtError("unsupported_alg");
  }

  const expected = await hmacSha256(secret, `${headerB64}.${payloadB64}`);
  const actual = base64UrlDecode(sigB64);
  if (!constantTimeEqual(expected, actual)) {
    throw new JwtError("bad_signature");
  }

  const payload = decodeJsonSegment(payloadB64) as Partial<AudioClaims>;
  if (typeof payload.exp !== "number" || payload.exp <= nowSeconds) {
    throw new JwtError("expired");
  }
  if (!payload.sub || !payload.tid || !payload.key) {
    throw new JwtError("missing_claims");
  }
  return {
    sub: String(payload.sub),
    tid: String(payload.tid),
    key: String(payload.key),
    iat: Number(payload.iat ?? 0),
    exp: Number(payload.exp),
  };
}

async function hmacSha256(secret: string, message: string): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return new Uint8Array(sig);
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

function base64UrlDecode(s: string): Uint8Array {
  const pad = (4 - (s.length % 4)) % 4;
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

function decodeJsonSegment(seg: string): Record<string, unknown> {
  const bytes = base64UrlDecode(seg);
  const text = new TextDecoder().decode(bytes);
  try {
    return JSON.parse(text);
  } catch {
    throw new JwtError("malformed_segment");
  }
}
