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

/**
 * Cursor-paginated envelope returned by all Phase 02 list endpoints.
 * ``next_cursor === null`` means the caller has reached the end of the
 * stream. Pass the opaque string verbatim back to the same endpoint to
 * fetch the next page.
 */
export type Page<T> = {
  items: T[];
  next_cursor: string | null;
};

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
export interface PublicUserProfile {
  id: string;
  display_name: string;
  character_key: string | null;
  role_label: string | null;
  joined_at: string;
  today_focus_minutes: number;
  streak_days: number;
  all_time_focus_hours: number;
  level: number;
  xp: number;
  xp_next_level: number;
}

export interface UserStats {
  total_tomatoes: number;
  all_time_focus_hours: number;
  week_total_hours: number;
  streak_days: number;
  weekly_rank: number;
  heatmap: number[][];
  level: number;
  xp: number;
  xp_next_level: number;
}

export const userApi = {
  updateMe(input: { display_name?: string; character_key?: string; role_label?: string }) {
    return apiFetch<User>("/api/v1/users/me", { method: "PATCH", body: input });
  },
  getPublicProfile(userId: string) {
    return apiFetch<PublicUserProfile>(`/api/v1/users/${userId}/public`);
  },
  myStats() {
    return apiFetch<UserStats>("/api/v1/users/me/stats");
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

// ── wallet writes ──────────────────────────────────────
export interface RedeemCodeResponse {
  currency_code: string;
  amount_minor: number;
  balance_after_minor: number;
  transaction_id: string;
}

export interface GiftResponse {
  transaction_id: string;
  balance_after_minor: number;
  amount_minor: number;
  recipient_user_id: string;
}

// Augment the read-only `walletApi` further down with write paths.
// Defined here so the type inference picks up the wider shape.
const walletWriteApi = {
  redeem(code: string) {
    return apiFetch<RedeemCodeResponse>("/api/v1/me/wallet/redeem", {
      method: "POST",
      body: { code },
    });
  },
  gift(input: {
    recipient_user_id: string;
    amount_minor: number;
    message?: string | null;
    /** Optional per-click UUID. Backend treats the same key as a retry
     *  (returns the original transaction) instead of duplicating the
     *  transfer. Callers SHOULD generate one per Send-button click via
     *  `crypto.randomUUID()` so double-click doesn't double-charge. */
    idempotencyKey?: string;
  }) {
    const { idempotencyKey, ...body } = input;
    return apiFetch<GiftResponse>("/api/v1/me/wallet/gift", {
      method: "POST",
      body,
      headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
    });
  },
};

// ── match chat + agenda (buddy realtime) ───────────────
export interface MatchChatMessage {
  id: string;
  match_id: string;
  sender_id: string;
  kind: "text" | "note_share" | "system";
  body: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface MatchAgendaItem {
  id: string;
  match_id: string;
  position: number;
  body: string;
  status: "pending" | "in_progress" | "done";
  created_by: string;
  checked_by: string | null;
  checked_at: string | null;
  created_at: string;
  updated_at: string;
}

export const matchChatApi = {
  list(matchId: string, cursor?: string, limit = 50) {
    const qs = new URLSearchParams({ limit: String(limit) });
    if (cursor) qs.set("cursor", cursor);
    return apiFetch<Page<MatchChatMessage>>(
      `/api/v1/matches/${encodeURIComponent(matchId)}/messages?${qs.toString()}`,
      { method: "GET" },
    );
  },
  send(
    matchId: string,
    body: string,
    opts: { kind?: "text" | "note_share" | "system"; metadata?: Record<string, unknown> } = {},
  ) {
    return apiFetch<MatchChatMessage>(
      `/api/v1/matches/${encodeURIComponent(matchId)}/messages`,
      {
        method: "POST",
        body: {
          kind: opts.kind ?? "text",
          body,
          metadata: opts.metadata ?? null,
        },
      },
    );
  },
};

export const matchAgendaApi = {
  list(matchId: string) {
    return apiFetch<{ items: MatchAgendaItem[] }>(
      `/api/v1/matches/${encodeURIComponent(matchId)}/agenda`,
      { method: "GET" },
    );
  },
  create(matchId: string, body: string) {
    return apiFetch<MatchAgendaItem>(
      `/api/v1/matches/${encodeURIComponent(matchId)}/agenda`,
      { method: "POST", body: { body } },
    );
  },
  update(
    matchId: string,
    itemId: string,
    patch: { body?: string; status?: MatchAgendaItem["status"]; position?: number },
  ) {
    return apiFetch<MatchAgendaItem>(
      `/api/v1/matches/${encodeURIComponent(matchId)}/agenda/${encodeURIComponent(itemId)}`,
      { method: "PATCH", body: patch },
    );
  },
  remove(matchId: string, itemId: string) {
    return apiFetch<void>(
      `/api/v1/matches/${encodeURIComponent(matchId)}/agenda/${encodeURIComponent(itemId)}`,
      { method: "DELETE" },
    );
  },
};

// ── user preferences ───────────────────────────────────
export type PreferencesBundle = Record<string, unknown>;

export const preferencesApi = {
  get() {
    return apiFetch<PreferencesBundle>("/api/v1/me/preferences", {
      method: "GET",
    });
  },
  patch(patch: PreferencesBundle) {
    return apiFetch<PreferencesBundle>("/api/v1/me/preferences", {
      method: "PATCH",
      body: patch,
    });
  },
};

// ── friends ────────────────────────────────────────────
export interface FriendSummary {
  friendship_id: string;
  user_id: string;
  display_name: string;
  character_key: string | null;
  status: "requested" | "accepted" | "blocked";
  requested_by_me: boolean;
  created_at: string;
  accepted_at: string | null;
}

export interface FocusingNowItem {
  user_id: string;
  display_name: string;
  character_key: string | null;
  session_id: string;
  started_at: string;
  minutes_planned: number | null;
}

export interface FriendSearchResult {
  user_id: string;
  display_name: string;
  character_key: string | null;
  friendship_status: "none" | "requested" | "accepted" | "blocked";
  friendship_id: string | null;
  requested_by_me: boolean;
}

export const friendsApi = {
  list(status: "accepted" | "requested" = "accepted") {
    return apiFetch<Page<FriendSummary>>(
      `/api/v1/friends?status=${status}`,
      { method: "GET" },
    );
  },
  focusingNow() {
    return apiFetch<{ friends_focusing: FocusingNowItem[] }>(
      "/api/v1/friends/focusing-now",
      { method: "GET" },
    );
  },
  search(query: string) {
    const q = encodeURIComponent(query.trim());
    return apiFetch<{ results: FriendSearchResult[] }>(
      `/api/v1/friends/search?q=${q}`,
      { method: "GET" },
    );
  },
  request(userId: string) {
    return apiFetch<FriendSummary>("/api/v1/friends/requests", {
      method: "POST",
      body: { user_id: userId },
    });
  },
  accept(friendshipId: string) {
    return apiFetch<FriendSummary>(
      `/api/v1/friends/requests/${encodeURIComponent(friendshipId)}/accept`,
      { method: "POST" },
    );
  },
  reject(friendshipId: string) {
    return apiFetch<void>(
      `/api/v1/friends/requests/${encodeURIComponent(friendshipId)}`,
      { method: "DELETE" },
    );
  },
  unfriend(friendshipId: string) {
    return apiFetch<void>(
      `/api/v1/friends/${encodeURIComponent(friendshipId)}`,
      { method: "DELETE" },
    );
  },
};

// ── feedback ───────────────────────────────────────────
export type FeedbackCategory = "bug" | "suggestion" | "praise" | "other";

export interface FeedbackSubmitInput {
  category: FeedbackCategory;
  body: string;
  contact_email?: string | null;
  locale: string;
  app_version?: string | null;
  context?: Record<string, unknown> | null;
}

export interface FeedbackSubmitResponse {
  id: string;
  status: string;
  created_at: string;
}

export const feedbackApi = {
  submit(input: FeedbackSubmitInput) {
    return apiFetch<FeedbackSubmitResponse>("/api/v1/feedback", {
      method: "POST",
      body: input,
    });
  },
};

export const notesApi = {
  list(opts: { matchId?: string; sharedOnly?: boolean } = {}) {
    const params = new URLSearchParams();
    if (opts.matchId) params.set("match_id", opts.matchId);
    if (opts.sharedOnly) params.set("shared_only", "true");
    const qs = params.toString() ? `?${params.toString()}` : "";
    return apiFetch<Page<NoteWithShare>>(`/api/v1/notes${qs}`, { method: "GET" });
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
/**
 * Discriminated response shape for ``POST /matches/auto``.
 *
 * - ``matched``: paired immediately with another waiter (status 201).
 *   The frontend transitions straight to the "proposed" modal state.
 * - ``waiting``: enqueued in the matching pool (status 202). The
 *   frontend shows a "searching for a partner" state until either
 *   another real user pairs with us or the per-user fallback deadline
 *   triggers a bot match (both arrive over WebSocket as ``match.proposed``).
 *
 * Mirrors backend `app/api/v1/matches/schemas.py:MatchAutoResponse`.
 * Will be regenerated into `types.gen.ts` next time
 * `scripts/gen-api-types.sh` runs against the live backend.
 */
export type MatchAutoMatchedResponse = {
  status: "matched";
  via: "waiting_pool" | "bot_fallback";
  match: Match;
};
export type MatchAutoWaitingResponse = {
  status: "waiting";
  enqueued_at_ms: number;
  bot_fallback_at_ms: number;
};
export type MatchAutoResponse =
  | MatchAutoMatchedResponse
  | MatchAutoWaitingResponse;

export type MatchQueueStatusResponse = {
  status: "waiting";
  enqueued_at_ms: number;
  bot_fallback_at_ms: number;
};

export const matchesApi = {
  propose(candidate_id: string) {
    return apiFetch<Match>("/api/v1/matches", {
      method: "POST",
      body: { candidate_id },
    });
  },
  /** Request matchmaking via the waiting-pool flow.
   *
   * Returns ``MatchAutoMatchedResponse`` if a partner was already waiting
   * (or no real users were online and a bot was auto-accepted), or
   * ``MatchAutoWaitingResponse`` if the caller was placed in the pool.
   * In the waiting case the actual pairing arrives over WebSocket. */
  auto() {
    return apiFetch<MatchAutoResponse>("/api/v1/matches/auto", {
      method: "POST",
    });
  },
  /** Leave the waiting pool. Idempotent (204 even when not queued). */
  cancelQueue() {
    return apiFetch<void>("/api/v1/matches/queue", { method: "DELETE" });
  },
  /** Fetch the caller's current queue status. 404 ``not_in_queue`` when
   *  the caller isn't waiting — callers should catch ``ApiError`` and
   *  treat 404 as "not in queue". */
  myQueue() {
    return apiFetch<MatchQueueStatusResponse>("/api/v1/matches/queue/me", {
      method: "GET",
    });
  },
  accept(id: string) {
    return apiFetch<Match>(`/api/v1/matches/${id}/accept`, { method: "POST" });
  },
  skip(id: string) {
    return apiFetch<Match>(`/api/v1/matches/${id}/skip`, { method: "POST" });
  },
  recent() {
    // Phase 02 cursor pagination — backend returns ``Page[Match]``.
    // Existing callers only need the first page; ignore ``next_cursor``
    // unless/until infinite scroll is wired up.
    return apiFetch<Page<Match>>("/api/v1/matches/recent", { method: "GET" });
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
    return apiFetch<Page<Achievement>>("/api/v1/achievements", { method: "GET" });
  },
  mine() {
    return apiFetch<Page<Achievement>>("/api/v1/achievements/me", { method: "GET" });
  },
};
export const shopApi = {
  list(category?: string) {
    const qs = category ? `?category=${encodeURIComponent(category)}` : "";
    return apiFetch<Page<ShopItem>>(`/api/v1/shop${qs}`, { method: "GET", auth: false });
  },
};

// ── presence ───────────────────────────────────────────
export const presenceApi = {
  /** Snapshot of who is currently walking the street (cap to N visible).
   *  Backend orders real users first then bots, so a high cap guarantees
   *  every logged-in human is rendered even on crowded streets. */
  listStreet(cap = 200) {
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
    return apiFetch<Page<WalletTransaction>>(
      `/api/v1/me/wallet/transactions?limit=${limit}`,
      { method: "GET" },
    );
  },
  redeem: walletWriteApi.redeem,
  gift: walletWriteApi.gift,
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
// Playback goes through the audio proxy (Cloudflare Worker in prod):
// the frontend POSTs play-token to get a short-TTL JWT URL it then
// hands to <audio src>. Tokens are per-track, ~5 min TTL, and bound
// to the caller's session via Authorization on the issuing call.
export interface PlayTokenResponse {
  url: string;
  expires_at: string;
}

export const tracksApi = {
  list(mood?: string) {
    const qs = mood ? `?mood=${encodeURIComponent(mood)}` : "";
    return apiFetch<Track[]>(`/api/v1/tracks${qs}`, { method: "GET", auth: false });
  },
  get(id: string) {
    return apiFetch<Track>(`/api/v1/tracks/${id}`, { method: "GET", auth: false });
  },
  /** Issue a short-TTL signed URL the browser can pass to `<audio src>`. */
  getPlayToken(id: string) {
    return apiFetch<PlayTokenResponse>(`/api/v1/tracks/${id}/play-token`, {
      method: "POST",
    });
  },
};

// ── broadcast (10 short MP4 clips in the billboard) ─────
// Playback goes through a sibling Cloudflare Worker fronting a private
// R2 bucket. Identical token contract to tracks: short-TTL HS256 JWT
// minted per clip, redeemed by the Worker. Auth-required so anonymous
// scrapers can't farm tokens.
export const broadcastApi = {
  getPlayToken(clipId: string) {
    return apiFetch<PlayTokenResponse>(
      `/api/v1/broadcast/${clipId}/play-token`,
      { method: "POST" },
    );
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

// ── shared cohort stations (Phase 10) ──────────────────
// City + matched-pair stations: one canonical cursor per scope, fan-out
// via WS ``station.cursor`` events. Both endpoints require auth; pair
// returns 403 to non-members. When ``feat_shared_station=false`` on the
// backend, both 404 (frontend stationStore.hydrate* swallows that and
// the source-selector falls back to the personal player).
export interface StationCursorDTO {
  kind: "city" | "pair";
  scope_id: string;
  playlist_ids: string[];
  cursor_index: number;
  started_at_ms: number;
  version: number;
}

export interface StationTrackDTO {
  id: string;
  title: string;
  artist: string | null;
  mood: string;
  duration_ms: number | null;
  content_type: string;
}

export interface StationResponse {
  cursor: StationCursorDTO;
  tracks: StationTrackDTO[];
}

export const stationsApi = {
  getCity() {
    return apiFetch<StationResponse>("/api/v1/stations/city", { method: "GET" });
  },
  getPair(matchId: string) {
    return apiFetch<StationResponse>(
      `/api/v1/stations/pair/${encodeURIComponent(matchId)}`,
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

// ── match-rooms (Phase 7) ──────────────────────────────
// Shared focus rooms scoped to one accepted match. The path key is
// the match id (the value the frontend already has after accept); the
// server resolves the canonical room behind it. Non-participants get
// 404 (NOT 403) — the API surface intentionally hides room existence.
export type MatchRoomStatusDTO = "open" | "both_joined" | "active" | "ended";
export type RoomParticipantRoleDTO = "requester" | "candidate";

export interface MatchRoomParticipant {
  user_id: string;
  role: RoomParticipantRoleDTO;
  joined_at: string | null;
  left_at: string | null;
  focus_session_id: string | null;
}

export interface MatchRoomSnapshot {
  id: string;
  match_id: string;
  status: MatchRoomStatusDTO;
  opened_at: string;
  activated_at: string | null;
  ended_at: string | null;
  ended_reason: string | null;
  participants: MatchRoomParticipant[];
  // Phase 8 — populated only while the room is ``active`` so a reload
  // mid-session can restore the countdown via the snapshot endpoint
  // (without these the UI shows "0:00" until the first timer_tick).
  timer_started_at: string | null;
  timer_duration_seconds: number | null;
  timer_remaining_seconds: number | null;
  timer_expected_end_at: string | null;
}

export const matchRoomApi = {
  getSnapshot(matchId: string) {
    return apiFetch<MatchRoomSnapshot>(
      `/api/v1/rooms/match/${encodeURIComponent(matchId)}`,
      { method: "GET" },
    );
  },
  join(matchId: string) {
    return apiFetch<MatchRoomSnapshot>(
      `/api/v1/rooms/match/${encodeURIComponent(matchId)}/join`,
      { method: "POST" },
    );
  },
  leave(matchId: string) {
    return apiFetch<MatchRoomSnapshot>(
      `/api/v1/rooms/match/${encodeURIComponent(matchId)}/leave`,
      { method: "POST" },
    );
  },
  startSession(matchId: string, durationSeconds: number) {
    return apiFetch<MatchRoomSnapshot>(
      `/api/v1/rooms/match/${encodeURIComponent(matchId)}/start`,
      {
        method: "POST",
        body: JSON.stringify({ duration_seconds: durationSeconds }),
        headers: { "Content-Type": "application/json" },
      },
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
