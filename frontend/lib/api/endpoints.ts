import { apiFetch, tokenStore } from "./client";
import type {
  Achievement,
  AuthResponse,
  EquipmentResponse,
  FocusSession,
  FocusSessionMode,
  LeaderboardEntry,
  Match,
  Note,
  PurchaseResponse,
  Room,
  RoomTheme,
  ShopItem,
  StreetUser,
  User,
  UserItem,
  Wallet,
  WalletTransaction,
} from "./types.gen";

// ── auth ───────────────────────────────────────────────
export const authApi = {
  async signUp(input: {
    email: string;
    password: string;
    display_name: string;
    terms_accepted: boolean;
    terms_version: string;
    marketing_opt_in: boolean;
  }) {
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
  async forgotPassword(input: { email: string }) {
    return apiFetch<{ ok: boolean }>("/api/v1/auth/forgot-password", {
      method: "POST",
      body: input,
      auth: false,
    });
  },
  async resetPassword(input: { token: string; newPassword: string }) {
    return apiFetch<{ ok: boolean }>("/api/v1/auth/reset-password", {
      method: "POST",
      body: { token: input.token, new_password: input.newPassword },
      auth: false,
    });
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

// ── presence ───────────────────────────────────────────
export const presenceApi = {
  /** Snapshot of who is currently walking the street (cap to N visible). */
  listStreet(cap = 12) {
    return apiFetch<StreetUser[]>(`/api/v1/presence/street?cap=${cap}`, {
      method: "GET",
    });
  },
};

// ── wallet / items / purchase ──────────────────────────
export const walletApi = {
  list() {
    return apiFetch<Wallet[]>("/api/v1/me/wallet", { method: "GET" });
  },
  transactions(limit = 20) {
    return apiFetch<WalletTransaction[]>(
      `/api/v1/me/wallet/transactions?limit=${limit}`,
      { method: "GET" },
    );
  },
};

export const userItemsApi = {
  list() {
    return apiFetch<UserItem[]>("/api/v1/me/items", { method: "GET" });
  },
};

export const purchaseApi = {
  buy(itemId: string, currencyCode = "T") {
    return apiFetch<PurchaseResponse>(`/api/v1/shop/items/${itemId}/purchase`, {
      method: "POST",
      body: { currency_code: currencyCode },
    });
  },
};

// ── equipment ──────────────────────────────────────────
export const equipmentApi = {
  /** Equip a car the user owns. Pass ``null`` to unequip. */
  setVehicle(vehicleItemId: string | null) {
    return apiFetch<EquipmentResponse>("/api/v1/me/equipment", {
      method: "PUT",
      body: { vehicle_item_id: vehicleItemId },
    });
  },
};

// ── rooms (Phase 4) ────────────────────────────────────
export const roomApi = {
  /** Fetch the current user's room. First call lazy-creates it server-side. */
  getMine() {
    return apiFetch<Room>("/api/v1/me/room", { method: "GET" });
  },
  /** Update the room's name and/or theme. Omitted fields stay unchanged. */
  updateMine(patch: { name?: string; theme?: RoomTheme }) {
    return apiFetch<Room>("/api/v1/me/room", { method: "PUT", body: patch });
  },
  /** Read any room by id. Phase 4 returns 403 unless caller is the owner. */
  getById(roomId: string) {
    return apiFetch<Room>(`/api/v1/rooms/${roomId}`, { method: "GET" });
  },
};
