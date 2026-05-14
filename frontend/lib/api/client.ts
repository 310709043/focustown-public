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

const TOKEN_KEY = "focustown.tokens";

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

async function refreshTokens(refreshToken: string): Promise<Tokens> {
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

export interface ApiFetchOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  auth?: boolean; // default true
}

export async function apiFetch<T>(
  path: string,
  opts: ApiFetchOptions = {},
): Promise<T> {
  const { body, auth = true, headers, ...rest } = opts;

  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
  const baseHeaders: Record<string, string> = { ...(headers as Record<string, string> ?? {}) };
  // Let the browser set the multipart boundary itself when sending FormData.
  if (!isFormData && !baseHeaders["content-type"] && !baseHeaders["Content-Type"]) {
    baseHeaders["content-type"] = "application/json";
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

  let res = await fetch(`${config.apiBaseUrl}${path}`, init);

  if (res.status === 401 && auth) {
    const tokens = tokenStore.load();
    if (tokens?.refresh_token) {
      try {
        const fresh = await refreshTokens(tokens.refresh_token);
        (init.headers as Record<string, string>).authorization = `Bearer ${fresh.access_token}`;
        res = await fetch(`${config.apiBaseUrl}${path}`, init);
      } catch {
        tokenStore.clear();
      }
    }
  }

  if (res.status === 204) return undefined as T;

  if (!res.ok) {
    let code = "request_failed";
    let message = res.statusText;
    try {
      const payload = await res.json();
      code = payload?.error?.code ?? code;
      message = payload?.error?.message ?? message;
    } catch {
      /* ignore */
    }
    throw new ApiError(message, res.status, code);
  }

  return (await res.json()) as T;
}
