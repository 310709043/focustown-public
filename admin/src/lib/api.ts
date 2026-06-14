const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
const TOKEN_KEY = "lowbatterytown.tokens";

interface Tokens {
  access_token: string;
  refresh_token: string;
}

function loadTokens(): Tokens | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(TOKEN_KEY);
  return raw ? (JSON.parse(raw) as Tokens) : null;
}

function saveTokens(t: Tokens) {
  localStorage.setItem(TOKEN_KEY, JSON.stringify(t));
}

export function clearTokens() {
  localStorage.removeItem(TOKEN_KEY);
}

export function isLoggedIn(): boolean {
  return loadTokens() !== null;
}

export async function login(displayName: string, password: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/auth/signin`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ display_name: displayName, password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? "Login failed");
  }
  const tokens = (await res.json()) as Tokens;
  saveTokens(tokens);
}

export async function register(email: string, password: string, displayName: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/auth/signup`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email,
      password,
      display_name: displayName,
      terms_accepted: true,
      terms_version: "1.0",
      marketing_opt_in: false,
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? "Registration failed");
  }
  const tokens = (await res.json()) as Tokens;
  saveTokens(tokens);
}

export async function adminFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const tokens = loadTokens();
  if (!tokens) throw new Error("Not authenticated");

  const headers: Record<string, string> = {
    "content-type": "application/json",
    authorization: `Bearer ${tokens.access_token}`,
    ...(opts.headers as Record<string, string> ?? {}),
  };

  let res = await fetch(`${API_BASE}${path}`, { ...opts, headers });

  // Try refresh on 401
  if (res.status === 401 && tokens.refresh_token) {
    const refreshRes = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refresh_token: tokens.refresh_token }),
    });
    if (refreshRes.ok) {
      const fresh = (await refreshRes.json()) as Tokens;
      saveTokens(fresh);
      headers.authorization = `Bearer ${fresh.access_token}`;
      res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
    } else {
      clearTokens();
      throw new Error("Session expired");
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? `Request failed (${res.status})`);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/* ── Types ── */

export interface OverviewStats {
  total_users: number;
  active_today: number;
  online_now: number;
  sessions_today: number;
  avg_duration_seconds: number;
  match_queue_depth: number;
  new_feedback_count: number;
}

export interface AdminUserItem {
  id: string;
  email: string;
  display_name: string;
  character_key: string | null;
  is_active: boolean;
  created_at: string;
  last_focus_at: string | null;
}

export interface AdminUserList {
  items: AdminUserItem[];
  total: number;
  page: number;
  size: number;
}

export interface AdminFeedbackItem {
  id: string;
  user_id: string | null;
  category: string;
  body: string;
  contact_email: string | null;
  status: string;
  locale: string;
  app_version: string | null;
  created_at: string;
}

export interface AdminFeedbackList {
  items: AdminFeedbackItem[];
  total: number;
  page: number;
  size: number;
}
