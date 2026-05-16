import { config } from "../config";
import { apiFetch, tokenStore } from "./client";
import type {
  Achievement,
  AuthResponse,
  EquipmentResponse,
  FocusSession,
  FocusSessionMode,
  LeaderboardEntry,
  Match,
  MoveRoomItemInput,
  Note,
  PlaceRoomItemInput,
  PurchaseResponse,
  Room,
  RoomItem,
  RoomPlayback,
  RoomTheme,
  RoomTrack,
  RoomVisit,
  ShopItem,
  StreetUser,
  Track,
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
  async forgotPassword(input: { email: string; locale?: "en" | "zh-TW" }) {
    return apiFetch<{ ok: boolean }>("/api/v1/auth/forgot-password", {
      method: "POST",
      body: { email: input.email, locale: input.locale ?? "zh-TW" },
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
// ``Note`` is generated from the OpenAPI schema without
// ``shared_in_match_id`` yet (regenerate ``types.gen.ts`` after the
// 0012 migration is deployed). Treat the field as optional locally
// so consumers can read it before regeneration.
export type NoteWithShare = Note & {
  user_id: string;
  shared_in_match_id?: string | null;
};

export const notesApi = {
  list(opts: { matchId?: string } = {}) {
    const qs = opts.matchId
      ? `?match_id=${encodeURIComponent(opts.matchId)}`
      : "";
    return apiFetch<NoteWithShare[]>(`/api/v1/notes${qs}`, { method: "GET" });
  },
  create(input: { title?: string; body?: string; shared_in_match_id?: string | null }) {
    return apiFetch<NoteWithShare>("/api/v1/notes", { method: "POST", body: input });
  },
  update(
    id: string,
    input: {
      title?: string;
      body?: string;
      done?: boolean;
      shared_in_match_id?: string | null;
    },
  ) {
    return apiFetch<NoteWithShare>(`/api/v1/notes/${id}`, { method: "PATCH", body: input });
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
  /** One-shot matchmaking. Server picks a candidate (real human first,
   *  bot fallback) and, for bots, auto-accepts on the bot's behalf so
   *  the returned match is already ``accepted``. The frontend just
   *  navigates to the focus room. */
  auto() {
    return apiFetch<Match>("/api/v1/matches/auto", { method: "POST" });
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
  /** Fetch a single match by id. Used by /focus/{id} to rehydrate the
   *  partner pairing header after a page reload (the in-memory matchStore
   *  does not survive reload). 404 / 403 errors propagate to the caller. */
  getById(id: string) {
    return apiFetch<Match>(`/api/v1/matches/${id}`, { method: "GET" });
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
  /** Read any room by id. After Phase 5, public rooms are readable by any
   *  authenticated user; invite_only rooms still return 403 to non-owners. */
  getById(roomId: string) {
    return apiFetch<Room>(`/api/v1/rooms/${roomId}`, { method: "GET" });
  },
};

// ── room decorations (Phase 5) ─────────────────────────
// Reads are visitor-eligible on public rooms; mutations are owner-only and
// scoped to ``/me/room/items`` (no room id in the path — derived from the
// caller's owned room server-side).
export const decorationApi = {
  list(roomId: string) {
    return apiFetch<RoomItem[]>(`/api/v1/rooms/${roomId}/items`, {
      method: "GET",
    });
  },
  place(input: PlaceRoomItemInput) {
    return apiFetch<RoomItem>("/api/v1/me/room/items", {
      method: "POST",
      body: input,
    });
  },
  move(itemId: string, input: MoveRoomItemInput) {
    return apiFetch<RoomItem>(`/api/v1/me/room/items/${itemId}`, {
      method: "PUT",
      body: input,
    });
  },
  remove(itemId: string) {
    return apiFetch<void>(`/api/v1/me/room/items/${itemId}`, {
      method: "DELETE",
    });
  },
};

// ── tracks (V1: seeded-only library) ───────────────────
// V1 ships a curated official library only — no user upload / delete.
// The streaming endpoint stays unauthenticated so <audio src> can follow
// the 302 redirect into S3 / MinIO presigned URLs without bearer tokens.
export const tracksApi = {
  list(mood?: string) {
    const qs = mood ? `?mood=${encodeURIComponent(mood)}` : "";
    return apiFetch<Track[]>(`/api/v1/tracks${qs}`, { method: "GET", auth: false });
  },
  get(id: string) {
    return apiFetch<Track>(`/api/v1/tracks/${id}`, { method: "GET", auth: false });
  },
  /** Absolute URL suitable for `<audio src={...}>`. */
  streamUrl(id: string) {
    return `${config.apiBaseUrl}/api/v1/tracks/${id}/stream`;
  },
};

// ── personal radio (per-user random playlist) ─────────────
// Independent per (user, context, day). Two users in the same room
// see different orderings.
export type PersonalPlaylistContext = "city" | "focus" | "room";

export interface PersonalPlaylistTrack {
  id: string;
  title: string;
  artist: string | null;
  mood: string;
  duration_ms: number | null;
  content_type: string;
}

export interface PersonalPlaylistResponse {
  context: PersonalPlaylistContext;
  context_id: string | null;
  day: string;
  tracks: PersonalPlaylistTrack[];
}

export const personalRadioApi = {
  getPlaylist(opts: {
    context: PersonalPlaylistContext;
    contextId?: string | null;
  }) {
    const params = new URLSearchParams();
    params.set("context", opts.context);
    if (opts.contextId) params.set("context_id", opts.contextId);
    return apiFetch<PersonalPlaylistResponse>(
      `/api/v1/playback/playlist?${params.toString()}`,
      { method: "GET" },
    );
  },
};

// ── per-room playlist (Phase 7) ────────────────────────
// add(): pass the body object — apiFetch JSON-stringifies for us. Earlier
// versions of this module called JSON.stringify here too, which
// double-encoded the payload and made the backend see track_id=undefined.
export const roomTracksApi = {
  list() {
    return apiFetch<RoomTrack[]>("/api/v1/me/room/tracks", { method: "GET" });
  },
  add(track_id: string) {
    return apiFetch<RoomTrack>("/api/v1/me/room/tracks", {
      method: "POST",
      body: { track_id },
    });
  },
  remove(track_id: string) {
    return apiFetch<void>(`/api/v1/me/room/tracks/${track_id}`, { method: "DELETE" });
  },
};

// ── room shared playback timeline (Phase 9) ────────────
// Owner mutations live under ``/me/room/playback/*`` (no room id in the
// path — derived from the caller's owned room). Visitor read uses
// ``/rooms/{room_id}/playback`` for the snapshot a freshly-joining
// listener needs to hydrate their <audio> and start drift-correcting.
export const roomPlaybackApi = {
  play() {
    return apiFetch<RoomPlayback>("/api/v1/me/room/playback/play", {
      method: "POST",
    });
  },
  pause() {
    return apiFetch<RoomPlayback | null>("/api/v1/me/room/playback/pause", {
      method: "POST",
    });
  },
  change(track_id: string) {
    return apiFetch<RoomPlayback>("/api/v1/me/room/playback/change", {
      method: "POST",
      body: { track_id },
    });
  },
  getByRoom(roomId: string) {
    return apiFetch<RoomPlayback | null>(
      `/api/v1/rooms/${roomId}/playback`,
      { method: "GET" },
    );
  },
};

// ── room visitor sessions (Phase 8) ────────────────────
// ``visit`` starts a session in a room; ``leave`` ends it. Both endpoints
// route through ``/rooms/{room_id}/...`` because the room_id is the
// path-level subject (unlike /me/room/* which is owner-scoped). Server
// publishes ``room.visitor_joined`` / ``room.visitor_left`` events on the
// ``room:{room_id}`` channel — frontend subscribes by sending a WS
// ``join`` frame after a successful HTTP visit.
export const roomVisitApi = {
  visit(roomId: string) {
    return apiFetch<RoomVisit>(`/api/v1/rooms/${roomId}/visit`, {
      method: "POST",
    });
  },
  leave(roomId: string) {
    return apiFetch<void>(`/api/v1/rooms/${roomId}/leave`, {
      method: "POST",
    });
  },
  listVisitors(roomId: string) {
    return apiFetch<RoomVisit[]>(`/api/v1/rooms/${roomId}/visitors`, {
      method: "GET",
    });
  },
};
