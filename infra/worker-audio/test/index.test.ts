import { env, createExecutionContext } from "cloudflare:test";
import { describe, expect, it, beforeAll } from "vitest";

import worker from "../src/index";

const SECRET = "test-audio-secret-please-rotate-32chars";

function base64Url(input: Uint8Array | string): string {
  const bytes =
    typeof input === "string" ? new TextEncoder().encode(input) : input;
  let bin = "";
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function sign(payload: Record<string, unknown>): Promise<string> {
  const header = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64Url(JSON.stringify(payload));
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, enc.encode(`${header}.${body}`)),
  );
  return `${header}.${body}.${base64Url(sig)}`;
}

const now = () => Math.floor(Date.now() / 1000);

async function call(path: string, init?: RequestInit) {
  const req = new Request(`https://audio.lowbatterytown.com${path}`, init);
  createExecutionContext(); // initializes per-request waitUntil context
  return worker.fetch(req, env as any);
}

beforeAll(async () => {
  // Seed the R2 bucket with a known object.
  await (env as any).AUDIO_BUCKET.put("tracks/test-key.mp3", "the-bytes-here", {
    httpMetadata: { contentType: "audio/mpeg" },
  });
});

describe("audio worker", () => {
  it("rejects missing token with 401", async () => {
    const res = await call("/track/trk-1");
    expect(res.status).toBe(401);
  });

  it("rejects malformed token with 401", async () => {
    const res = await call("/track/trk-1?t=not.a.jwt");
    expect(res.status).toBe(401);
  });

  it("rejects token signed with a different secret", async () => {
    const header = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const body = base64Url(
      JSON.stringify({
        sub: "u-1",
        tid: "trk-1",
        key: "tracks/test-key.mp3",
        iat: now(),
        exp: now() + 300,
      }),
    );
    const sig = base64Url("garbage-signature-bytes");
    const res = await call(`/track/trk-1?t=${header}.${body}.${sig}`);
    expect(res.status).toBe(401);
  });

  it("rejects expired token with 401", async () => {
    const t = await sign({
      sub: "u-1",
      tid: "trk-1",
      key: "tracks/test-key.mp3",
      iat: now() - 3600,
      exp: now() - 60,
    });
    const res = await call(`/track/trk-1?t=${t}`);
    expect(res.status).toBe(401);
  });

  it("rejects token whose tid does not match the URL", async () => {
    const t = await sign({
      sub: "u-1",
      tid: "trk-different",
      key: "tracks/test-key.mp3",
      iat: now(),
      exp: now() + 300,
    });
    const res = await call(`/track/trk-1?t=${t}`);
    expect(res.status).toBe(401);
  });

  it("rejects key outside tracks/ prefix with 403", async () => {
    const t = await sign({
      sub: "u-1",
      tid: "trk-1",
      key: "secret/admin-only.mp3",
      iat: now(),
      exp: now() + 300,
    });
    const res = await call(`/track/trk-1?t=${t}`);
    expect(res.status).toBe(403);
  });

  it("returns 404 when the R2 object is missing", async () => {
    const t = await sign({
      sub: "u-1",
      tid: "trk-1",
      key: "tracks/does-not-exist.mp3",
      iat: now(),
      exp: now() + 300,
    });
    const res = await call(`/track/trk-1?t=${t}`);
    expect(res.status).toBe(404);
  });

  it("streams the full object with 200 + cache headers", async () => {
    const t = await sign({
      sub: "u-1",
      tid: "trk-1",
      key: "tracks/test-key.mp3",
      iat: now(),
      exp: now() + 300,
    });
    const res = await call(`/track/trk-1?t=${t}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("accept-ranges")).toBe("bytes");
    expect(res.headers.get("cache-control")).toContain("private");
    expect(await res.text()).toBe("the-bytes-here");
  });

  it("honors Range header with 206 partial content", async () => {
    const t = await sign({
      sub: "u-1",
      tid: "trk-1",
      key: "tracks/test-key.mp3",
      iat: now(),
      exp: now() + 300,
    });
    const res = await call(`/track/trk-1?t=${t}`, {
      headers: { range: "bytes=0-3" },
    });
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toMatch(/^bytes 0-3\//);
    expect(await res.text()).toBe("the-");
  });

  it("CORS preflight echoes allowed origin", async () => {
    const res = await call("/track/trk-1", {
      method: "OPTIONS",
      headers: { origin: "https://lowbatterytown.com" },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(
      "https://lowbatterytown.com",
    );
  });

  it("CORS preflight omits header for non-allowed origin", async () => {
    const res = await call("/track/trk-1", {
      method: "OPTIONS",
      headers: { origin: "https://evil.example" },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });
});
