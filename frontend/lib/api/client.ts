import { config } from "../config";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
  }
}

type Tokens = { access_token: string; refresh_token: string };

const TOKEN_KEY = "lowbatterytown.tokens";

export const tokenStore = {
  load(): Tokens | null {
    if (typeof window === "undefined") return null;
    const raw = localStorage.getItem(TOKEN_KEY);
    return raw ? (JSON.parse(raw) as Tokens) : null;
  },
  save(t: Tokens) {
    if (typeof window === "undefined") return;
    localStorage.setItem(TOKEN_KEY, JSON.stringify(t));
  },
  clear() {
    if (typeof window === "undefined") return;
    localStorage.removeItem(TOKEN_KEY);
  },
};

export async function refreshTokens(refreshToken: string): Promise<Tokens> {
  const res = await fetch(`${config.apiBaseUrl}/api/v1/auth/refresh`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!res.ok) throw new ApiError("refresh_failed", res.status, "auth");
  const tokens = (await res.json()) as Tokens;
  tokenStore.save(tokens);
  return tokens;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 2;
const BASE_BACKOFF_MS = 500;
const JITTER_MS = 50;
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const IDEMPOTENT_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function newIdempotencyKey(): string {
  // ``crypto.randomUUID`` is in every browser we support and in Node ≥19;
  // the fallback only runs in vanishingly old SSR test contexts.
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `idem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function backoffDelay(attempt: number): number {
  const base = BASE_BACKOFF_MS * Math.pow(2, attempt);
  const jitter = Math.floor((Math.random() * 2 - 1) * JITTER_MS);
  return Math.max(0, base + jitter);
}

export interface ApiFetchOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  auth?: boolean;
  timeoutMs?: number;
  retryOn5xx?: boolean;
}

async function fetchOnce(
  url: string,
  init: RequestInit,
  auth: boolean,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let res = await fetch(url, { ...init, signal: controller.signal });

    if (res.status === 401 && auth) {
      const tokens = tokenStore.load();
      if (tokens?.refresh_token) {
        try {
          const fresh = await refreshTokens(tokens.refresh_token);
          (init.headers as Record<string, string>).authorization =
            `Bearer ${fresh.access_token}`;
          res = await fetch(url, { ...init, signal: controller.signal });
        } catch {
          console.warn("[apiFetch] refresh failed; clearing tokens");
          tokenStore.clear();
          throw new ApiError("refresh_failed", 401, "refresh_failed");
        }
      }
    }

    return res;
  } finally {
    clearTimeout(timer);
  }
}

export async function apiFetch<T>(
  path: string,
  opts: ApiFetchOptions = {},
): Promise<T> {
  const {
    body,
    auth = true,
    headers,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retryOn5xx,
    ...rest
  } = opts;

  const method = (rest.method ?? "GET").toUpperCase();
  const retryEnabled = retryOn5xx ?? SAFE_METHODS.has(method);

  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
  const baseHeaders: Record<string, string> = { ...(headers as Record<string, string> ?? {}) };
  if (!isFormData && !baseHeaders["content-type"] && !baseHeaders["Content-Type"]) {
    baseHeaders["content-type"] = "application/json";
  }
  // Auto-attach an Idempotency-Key on every mutation that didn't already
  // carry one. The same key MUST survive the 401-refresh retry below so
  // the second attempt dedups against the first instead of double-applying;
  // we set it on baseHeaders here (before the retry loop) so both attempts
  // share it.
  if (IDEMPOTENT_METHODS.has(method)) {
    const existing = baseHeaders["Idempotency-Key"] ?? baseHeaders["idempotency-key"];
    if (!existing) {
      baseHeaders["Idempotency-Key"] = newIdempotencyKey();
    }
  }

  const init: RequestInit = {
    ...rest,
    headers: baseHeaders,
    body: isFormData
      ? (body as FormData)
      : body !== undefined
        ? JSON.stringify(body)
        : undefined,
  };

  if (auth) {
    const tokens = tokenStore.load();
    if (tokens?.access_token) {
      (init.headers as Record<string, string>).authorization = `Bearer ${tokens.access_token}`;
    }
  }

  const url = `${config.apiBaseUrl}${path}`;
  let res: Response | null = null;
  let lastNetErr: unknown = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      res = await fetchOnce(url, init, auth, timeoutMs);
      if (res.ok || !retryEnabled || res.status < 500 || res.status > 599) break;
      if (attempt < MAX_RETRIES) {
        await sleep(backoffDelay(attempt));
        continue;
      }
    } catch (err) {
      if (err instanceof ApiError) throw err;
      lastNetErr = err;
      if (retryEnabled && attempt < MAX_RETRIES) {
        await sleep(backoffDelay(attempt));
        continue;
      }
      throw err;
    }
  }

  if (!res) throw lastNetErr ?? new ApiError("request_failed", 0, "network_error");

  if (res.status === 204) return undefined as T;

  if (!res.ok) {
    let code = "request_failed";
    let message = res.statusText;
    try {
      const payload = await res.json();
      code = payload?.error?.code ?? code;
      message = payload?.error?.message ?? message;
    } catch (parseErr) {
      console.warn(
        "[apiFetch] malformed error body",
        { path, status: res.status },
        parseErr instanceof Error ? parseErr.message : parseErr,
      );
      code = "malformed_error_body";
    }
    throw new ApiError(message, res.status, code);
  }

  return (await res.json()) as T;
}
