/**
 * Audio proxy Worker.
 *
 * One route: GET /track/<id>?t=<jwt>
 *
 * Validates the JWT (HS256 shared secret with the backend), reads the
 * R2 object whose key was signed into the token, and streams bytes back
 * to the browser with Range support so `<audio>` scrubbing works.
 *
 * The bucket is private — no public binding, no presigned URLs leak
 * out. R2->Worker is in-network (free + fast); Worker->browser lands
 * on Cloudflare's edge cache so repeat playbacks are virtually
 * origin-free.
 */

import { JwtError, verifyAudioToken } from "./jwt";

export interface Env {
  AUDIO_BUCKET: R2Bucket;
  AUDIO_PROXY_SECRET: string;
  ALLOWED_ORIGINS: string;
  TRACK_KEY_PREFIX: string;
}

const TRACK_PATH = /^\/track\/([A-Za-z0-9_-]+)\/?$/;

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return cors(new Response(null, { status: 204 }), req, env);
    if (req.method !== "GET" && req.method !== "HEAD") {
      return cors(json(405, { error: "method_not_allowed" }), req, env);
    }

    const match = TRACK_PATH.exec(url.pathname);
    if (!match) return cors(json(404, { error: "not_found" }), req, env);
    const trackId = match[1];

    const token = url.searchParams.get("t");
    if (!token) return cors(json(401, { error: "missing_audio_token" }), req, env);

    let claims;
    try {
      claims = await verifyAudioToken(token, env.AUDIO_PROXY_SECRET, nowSeconds());
    } catch (e) {
      const reason = e instanceof JwtError ? e.message : "verify_failed";
      return cors(json(401, { error: "invalid_audio_token", reason }), req, env);
    }
    if (claims.tid !== trackId) {
      return cors(json(401, { error: "audio_token_track_mismatch" }), req, env);
    }
    if (!claims.key.startsWith(env.TRACK_KEY_PREFIX)) {
      // Guard against a misconfigured upload writing under an unexpected
      // prefix; never read outside our tracks/* namespace.
      return cors(json(403, { error: "key_outside_track_prefix" }), req, env);
    }

    return cors(await serveR2(env.AUDIO_BUCKET, claims.key, req), req, env);
  },
};

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

async function serveR2(
  bucket: R2Bucket,
  key: string,
  req: Request,
): Promise<Response> {
  const range = parseRange(req.headers.get("range"));
  const opts: R2GetOptions = range ? { range } : {};
  const obj = req.method === "HEAD" ? await bucket.head(key) : await bucket.get(key, opts);
  if (!obj) return json(404, { error: "track_file_missing" });

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  if (!headers.has("content-type")) headers.set("content-type", "audio/mpeg");
  headers.set("accept-ranges", "bytes");
  // private cache: bytes are user-scoped via JWT. ~5 min matches the
  // token TTL so a refreshed token also refreshes the cached object.
  headers.set("cache-control", "private, max-age=300");
  headers.set("etag", `"${obj.etag}"`);

  if (req.method === "HEAD") {
    headers.set("content-length", String(obj.size));
    return new Response(null, { status: 200, headers });
  }

  // `obj` is R2ObjectBody here (we did .get not .head). Cast keeps TS happy.
  const body = (obj as R2ObjectBody).body;

  if (range) {
    // Resolve to a concrete [start, length] independent of which R2Range
    // variant the request produced. R2 returns the requested slice; we
    // just compute the matching Content-Range header.
    const [start, length] = resolveRange(range, obj.size);
    const end = start + length - 1;
    headers.set("content-range", `bytes ${start}-${end}/${obj.size}`);
    headers.set("content-length", String(length));
    return new Response(body, { status: 206, headers });
  }

  headers.set("content-length", String(obj.size));
  return new Response(body, { status: 200, headers });
}

function parseRange(header: string | null): R2Range | undefined {
  if (!header || !header.startsWith("bytes=")) return undefined;
  const spec = header.slice("bytes=".length);
  if (spec.includes(",")) return undefined;
  const [a, b] = spec.split("-", 2);
  if (a === "" && b !== "") return { suffix: Number(b) };
  if (a !== "" && b === "") return { offset: Number(a) };
  if (a !== "" && b !== "") {
    const offset = Number(a);
    return { offset, length: Number(b) - offset + 1 };
  }
  return undefined;
}

function resolveRange(range: R2Range, size: number): [number, number] {
  if ("suffix" in range) {
    const length = Math.min(range.suffix, size);
    return [size - length, length];
  }
  const start = range.offset ?? 0;
  const length = range.length ?? size - start;
  return [start, Math.min(length, size - start)];
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function cors(res: Response, req: Request, env: Env): Response {
  const origin = req.headers.get("origin");
  const allowed = env.ALLOWED_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean);
  const allow = origin && allowed.includes(origin) ? origin : null;
  if (allow) {
    res.headers.set("access-control-allow-origin", allow);
    res.headers.set("vary", "origin");
  }
  res.headers.set("access-control-allow-methods", "GET, HEAD, OPTIONS");
  res.headers.set("access-control-allow-headers", "range");
  res.headers.set("access-control-expose-headers", "content-range, accept-ranges, content-length");
  return res;
}
