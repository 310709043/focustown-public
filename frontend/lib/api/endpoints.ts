import { apiFetch, tokenStore } from "./client";
import type {
  Achievement,
  AuthResponse,
  FocusSession,
  FocusSessionMode,
  LeaderboardEntry,
  Match,
  Note,
  ShopItem,
  User,
} from "./types.gen";

// ── auth ───────────────────────────────────────────────
export const authApi = {
  async signUp(input: { email: string; password: string; display_name: string }) {
    const res = await apiFetch<AuthResponse>("/api/v1/auth/signup", {
      method: "POST",
      body: input,
      auth: false,
    });
    tokenStore.save(res.tokens);
    return res.user;
  },
  async signIn(input: { email: string; password: string }) {
    const res = await apiFetch<AuthResponse>("/api/v1/auth/signin", {
      method: "POST",
      body: input,
      auth: false,
    });
    tokenStore.save(res.tokens);
    return res.user;
  },
  async me() {
    return apiFetch<User>("/api/v1/auth/me", { method: "GET" });
  },
  signOut() {
    tokenStore.clear();
  },
};

// ── users ──────────────────────────────────────────────
export const userApi = {
  updateMe(input: { display_name?: string; character_key?: string; role_label?: string }) {
    return apiFetch<User>("/api/v1/users/me", { method: "PATCH", body: input });
  },
};

// ── sessions ───────────────────────────────────────────
export const sessionsApi = {
  start(input: {
    mode: FocusSessionMode;
    duration_seconds?: number;
    task_label?: string | null;
    partner_user_id?: string | null;
  }) {
    return apiFetch<FocusSession>("/api/v1/sessions", { method: "POST", body: input });
  },
  complete(id: string) {
    return apiFetch<FocusSession>(`/api/v1/sessions/${id}/complete`, { method: "POST" });
  },
  cancel(id: string) {
    return apiFetch<FocusSession>(`/api/v1/sessions/${id}/cancel`, { method: "POST" });
  },
  get(id: string) {
    return apiFetch<FocusSession>(`/api/v1/sessions/${id}`, { method: "GET" });
  },
};

// ── notes ──────────────────────────────────────────────
export const notesApi = {
  list() {
    return apiFetch<Note[]>("/api/v1/notes", { method: "GET" });
  },
  create(input: { title?: string; body?: string }) {
    return apiFetch<Note>("/api/v1/notes", { method: "POST", body: input });
  },
  update(id: string, input: { title?: string; body?: string; done?: boolean }) {
    return apiFetch<Note>(`/api/v1/notes/${id}`, { method: "PATCH", body: input });
  },
  remove(id: string) {
    return apiFetch<void>(`/api/v1/notes/${id}`, { method: "DELETE" });
  },
};

// ── matches ────────────────────────────────────────────
export const matchesApi = {
  propose(candidate_id: string) {
    return apiFetch<Match>("/api/v1/matches", {
      method: "POST",
      body: { candidate_id },
    });
  },
  accept(id: string) {
    return apiFetch<Match>(`/api/v1/matches/${id}/accept`, { method: "POST" });
  },
  skip(id: string) {
    return apiFetch<Match>(`/api/v1/matches/${id}/skip`, { method: "POST" });
  },
  recent() {
    return apiFetch<Match[]>("/api/v1/matches/recent", { method: "GET" });
  },
};

// ── leaderboard / achievements / shop ──────────────────
export const leaderboardApi = {
  today() {
    return apiFetch<LeaderboardEntry[]>("/api/v1/leaderboard/today", { method: "GET" });
  },
};
export const achievementsApi = {
  all() {
    return apiFetch<Achievement[]>("/api/v1/achievements", { method: "GET" });
  },
  mine() {
    return apiFetch<Achievement[]>("/api/v1/achievements/me", { method: "GET" });
  },
};
export const shopApi = {
  list(category?: string) {
    const qs = category ? `?category=${encodeURIComponent(category)}` : "";
    return apiFetch<ShopItem[]>(`/api/v1/shop${qs}`, { method: "GET", auth: false });
  },
};
