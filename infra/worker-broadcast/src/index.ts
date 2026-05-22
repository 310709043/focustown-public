/**
 * Broadcast proxy Worker.
 *
 * One route: GET /clip/<id>?t=<jwt>
 *
 * Validates the JWT (HS256 shared secret with the backend), checks the
 * Referer header against ALLOWED_REFERERS (hot-link block), reads the
 * R2 object whose key was signed into the token, and streams bytes back
 * to the browser with Range support so `<video>` scrubbing works.
 *
 * The bucket is private — no public binding, no presigned URLs leak
 * out. R2→Worker is in-network (free + fast); Worker→browser lands on
 * Cloudflare's edge cache so repeat playbacks are virtually
 * origin-free.
 */

import { JwtError, verifyBroadcastToken } from "./jwt";

export interface Env {
  BROADCAST_BUCKET: R2Bucket;
  BROADCAST_PROXY_SECRET: string;
  ALLOWED_ORIGINS: string;
  ALLOWED_REFERERS: string;
  BROADCAST_KEY_PREFIX: string;
}

const CLIP_PATH = /^\/clip\/([A-Za-z0-9_-]+)\/?$/;

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === "OPTIONS")
      return cors(new Response(null, { status: 204 }), req, env);
    if (req.method !== "GET" && req.method !== "HEAD") {
      return cors(json(405, { error: "method_not_allowed" }), req, env);
    }

    const match = CLIP_PATH.exec(url.pathname);
    if (!match) return cors(json(404, { error: "not_found" }), req, env);
    const clipId = match[1];

    // Hot-link block: reject if Referer doesn't match an allowed prefix.
    // Browsers always send Referer on cross-origin <video> fetches (we
    // never set Referrer-Policy: no-referrer on the frontend, see
    // middleware.ts). An empty allowlist disables the check — used in
    // dev / first-deploy.
    if (env.ALLOWED_REFERERS && env.ALLOWED_REFERERS.trim() !== "") {
      const referer = req.headers.get("referer") ?? "";
      const allowedRefs = env.ALLOWED_REFERERS.split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const ok = allowedRefs.some((prefix) => referer.startsWith(prefix));
      if (!ok) {
        return cors(json(403, { error: "referer_not_allowed" }), req, env);
      }
    }

    const token = url.searchParams.get("t");
    if (!token)
      return cors(json(401, { error: "missing_broadcast_token" }), req, env);

    let claims;
    try {
      claims = await verifyBroadcastToken(
        token,
        env.BROADCAST_PROXY_SECRET,
        nowSeconds(),
      );
    } catch (e) {
      const reason = e instanceof JwtError ? e.message : "verify_failed";
      return cors(
        json(401, { error: "invalid_broadcast_token", reason }),
        req,
        env,
      );
    }
    if (claims.cid !== clipId) {
      return cors(
        json(401, { error: "broadcast_token_clip_mismatch" }),
        req,
        env,
      );
    }
    if (!claims.key.startsWith(env.BROADCAST_KEY_PREFIX)) {
      // Guard against a forged token writing an unexpected prefix; never
      // read outside our broadcasts/* namespace.
      return cors(
        json(403, { error: "key_outside_broadcast_prefix" }),
        req,
        env,
      );
    }

    return cors(await serveR2(env.BROADCAST_BUCKET, claims.key, req), req, env);
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
  const obj =
    req.method === "HEAD"
      ? await bucket.head(key)
      : await bucket.get(key, opts);
  if (!obj) return json(404, { error: "broadcast_clip_file_missing" });

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  if (!headers.has("content-type")) headers.set("content-type", "video/mp4");
  headers.set("accept-ranges", "bytes");
  // private cache: bytes are user-scoped via JWT. ~5 min matches the
  // token TTL so a refreshed token also refreshes the cached object.
  headers.set("cache-control", "private, max-age=300");
  headers.set("etag", `"${obj.etag}"`);

  if (req.method === "HEAD") {
    headers.set("content-length", String(obj.size));
    return new Response(null, { status: 200, headers });
  }

  const body = (obj as R2ObjectBody).body;

  if (range) {
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
  const allowed = env.ALLOWED_ORIGINS.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const allow = origin && allowed.includes(origin) ? origin : null;
  if (allow) {
    res.headers.set("access-control-allow-origin", allow);
    res.headers.set("vary", "origin");
  }
  res.headers.set("access-control-allow-methods", "GET, HEAD, OPTIONS");
  res.headers.set("access-control-allow-headers", "range");
  res.headers.set(
    "access-control-expose-headers",
    "content-range, accept-ranges, content-length",
  );
  return res;
}
