/** Transport limits apply before JSON parsing, including chunked requests. */
export const MAX_BODY_BYTES = 16 * 1024;
export const MAX_FRAME_BYTES = 8 * 1024;
export const ADMIN_COOKIE = "__Host-lbt-admin";
export const ADMIN_SESSION_SECONDS = 12 * 3600;

export class PayloadTooLarge extends Error {}

export async function boundedJson(request: Request | Response, maxBytes = MAX_BODY_BYTES): Promise<unknown> {
  const declared = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new PayloadTooLarge();
  const reader = request.body?.getReader();
  if (!reader) return null;
  let bytes = 0;
  let text = "";
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new PayloadTooLarge();
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    try { return JSON.parse(text); } catch { return null; }
  } finally {
    reader.releaseLock();
  }
}

export async function sameSecret(provided: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  return crypto.subtle.timingSafeEqual(a, b);
}

/** Strong server key signs tickets; the password fingerprint invalidates them on rotation. */
export async function adminSigningKey(serverSecret: string, password: string): Promise<string> {
  const fingerprint = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(password));
  const hex = Array.from(new Uint8Array(fingerprint), b => b.toString(16).padStart(2, "0")).join("");
  return `${serverSecret}:lbt-admin:${hex}`;
}

export function adminCookie(token: string, maxAge = ADMIN_SESSION_SECONDS): string {
  return `${ADMIN_COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`;
}

export function cookieToken(request: Request): string | null {
  return (request.headers.get("Cookie") ?? "").split(";")
    .map(s => s.trim()).find(s => s.startsWith(`${ADMIN_COOKIE}=`))?.slice(ADMIN_COOKIE.length + 1) ?? null;
}

export async function tokenFingerprint(token: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, "0")).join("");
}
