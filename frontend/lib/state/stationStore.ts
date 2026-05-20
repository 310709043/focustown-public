"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

import { stationsApi } from "@/lib/api/endpoints";

/**
 * Shared cohort station — the "we're all listening together" layer.
 *
 * Backend ``StationService`` publishes one ``station.cursor`` event per
 * song advance to ``station:city:{id}`` or ``station:pair:{match_id}``.
 * Every connected user in that scope hears the SAME song at the SAME
 * wall-clock moment because their client computes its playback offset
 * from the server's authoritative ``started_at_ms`` anchor.
 *
 * Disconnect semantics (per user-supplied UX):
 *   • Connected (shared) view → only a "Disconnect" affordance. No
 *     prev/next, no volume, no mute. Total commitment to the cohort.
 *   • Disconnected view → personal shuffled playlist with prev/next
 *     + play/pause + volume slider + Mute toggle. Mute is EXCLUSIVE
 *     to the disconnected state.
 * The backend NEVER unsubscribes on disconnect — cursor events keep
 * arriving, the store just ignores them while disconnected. Reconnect
 * is instantaneous because the cursor is always known locally.
 */

import type { PersonalPlaylistTrack } from "@/lib/api/endpoints";

export type StationKind = "city" | "pair";

export interface StationCursor {
  kind: StationKind;
  scopeId: string;
  playlistIds: string[];
  cursorIndex: number;
  startedAtMs: number;
  version: number;
}

export interface StationTrackMeta {
  id: string;
  title: string;
  artist: string | null;
  mood: string;
  durationMs: number | null;
  contentType: string;
}

export type ConnectionState = "connected" | "disconnected";
export type ScopeKey = `${StationKind}:${string}`;

export interface ActiveScope {
  kind: StationKind;
  id: string;
}

export interface StationCursorPayload {
  type: "station.cursor";
  kind: StationKind;
  scope_id: string;
  playlist_ids: string[];
  cursor_index: number;
  started_at_ms: number;
  version: number;
}

/** Compose a stable per-scope key for ``connection``. */
export function scopeKey(scope: ActiveScope): ScopeKey {
  return `${scope.kind}:${scope.id}`;
}

interface StationState {
  city: StationCursor | null;
  pair: Record<string, StationCursor>;
  tracksById: Record<string, StationTrackMeta>;
  activeScope: ActiveScope | null;
  connection: Record<ScopeKey, ConnectionState>;
  mutedWhileDisconnected: boolean;
  personalPlaylist: PersonalPlaylistTrack[];
  personalIndex: number;

  // realtime ingress
  applyCursor: (msg: StationCursorPayload) => void;
  // bootstrap hydration from REST
  hydrateCity: () => Promise<void>;
  hydratePair: (matchId: string) => Promise<void>;
  // mode plumbing
  setActiveScope: (scope: ActiveScope | null) => void;
  // connection toggling
  disconnect: () => void;
  reconnect: () => void;
  setMuted: (m: boolean) => void;
  // personal playlist controls (disconnected only)
  setPersonalPlaylist: (tracks: PersonalPlaylistTrack[]) => void;
  nextPersonal: () => void;
  prevPersonal: () => void;
  // selectors
  getCursorFor: (scope: ActiveScope | null) => StationCursor | null;
  /** Compute the track id that should be playing AT ``now`` (ms) for
   *  the active scope's cursor. Returns null when no cursor / tracks
   *  are known yet. */
  getCurrentTrackId: (now: number) => string | null;
}

const DEFAULT_TRACK_DURATION_MS = 180_000;

function metaToDuration(meta: StationTrackMeta | undefined): number {
  return meta?.durationMs ?? DEFAULT_TRACK_DURATION_MS;
}

function defaultConnectionFor(_scope: ActiveScope): ConnectionState {
  // First-time scope encounter defaults to ``connected`` — the whole
  // point of the feature is the shared default. Users opt out per scope
  // and that choice is persisted.
  return "connected";
}

export const useStationStore = create<StationState>()(
  persist(
    (set, get) => ({
      city: null,
      pair: {},
      tracksById: {},
      activeScope: null,
      connection: {},
      mutedWhileDisconnected: false,
      personalPlaylist: [],
      personalIndex: 0,

      applyCursor(msg) {
        const cursor: StationCursor = {
          kind: msg.kind,
          scopeId: msg.scope_id,
          playlistIds: msg.playlist_ids,
          cursorIndex: msg.cursor_index,
          startedAtMs: msg.started_at_ms,
          version: msg.version,
        };
        if (msg.kind === "city") {
          set({ city: cursor });
        } else {
          set((s) => ({
            pair: { ...s.pair, [msg.scope_id]: cursor },
          }));
        }
      },

      async hydrateCity() {
        try {
          const res = await stationsApi.getCity();
          const meta: Record<string, StationTrackMeta> = {};
          for (const t of res.tracks) {
            meta[t.id] = {
              id: t.id,
              title: t.title,
              artist: t.artist,
              mood: t.mood,
              durationMs: t.duration_ms,
              contentType: t.content_type,
            };
          }
          set((s) => ({
            city: {
              kind: "city",
              scopeId: res.cursor.scope_id,
              playlistIds: res.cursor.playlist_ids,
              cursorIndex: res.cursor.cursor_index,
              startedAtMs: res.cursor.started_at_ms,
              version: res.cursor.version,
            },
            tracksById: { ...s.tracksById, ...meta },
          }));
        } catch {
          // Backend feature flag off → endpoint 404s. Leave city: null
          // so the source-selector falls back to the personal player.
        }
      },

      async hydratePair(matchId) {
        try {
          const res = await stationsApi.getPair(matchId);
          const meta: Record<string, StationTrackMeta> = {};
          for (const t of res.tracks) {
            meta[t.id] = {
              id: t.id,
              title: t.title,
              artist: t.artist,
              mood: t.mood,
              durationMs: t.duration_ms,
              contentType: t.content_type,
            };
          }
          set((s) => ({
            pair: {
              ...s.pair,
              [matchId]: {
                kind: "pair",
                scopeId: matchId,
                playlistIds: res.cursor.playlist_ids,
                cursorIndex: res.cursor.cursor_index,
                startedAtMs: res.cursor.started_at_ms,
                version: res.cursor.version,
              },
            },
            tracksById: { ...s.tracksById, ...meta },
          }));
        } catch {
          // 403 / 404 — leave the pair scope absent; the audio source
          // selector falls back to personal.
        }
      },

      setActiveScope(scope) {
        set((s) => {
          if (scope === null) return { activeScope: null };
          const key = scopeKey(scope);
          // First-time visit to a scope → seed it as connected. We do
          // NOT overwrite an existing user choice on re-entry.
          if (s.connection[key] === undefined) {
            return {
              activeScope: scope,
              connection: { ...s.connection, [key]: defaultConnectionFor(scope) },
            };
          }
          return { activeScope: scope };
        });
      },

      disconnect() {
        const { activeScope } = get();
        if (!activeScope) return;
        const key = scopeKey(activeScope);
        set((s) => ({
          connection: { ...s.connection, [key]: "disconnected" },
        }));
      },

      reconnect() {
        const { activeScope } = get();
        if (!activeScope) return;
        const key = scopeKey(activeScope);
        // Reconnect always returns mute to false — "rejoining the
        // cohort" is a clean slate; we don't carry over a silent
        // intent into a state that has no mute control.
        set((s) => ({
          connection: { ...s.connection, [key]: "connected" },
          mutedWhileDisconnected: false,
        }));
      },

      setMuted(m) {
        set({ mutedWhileDisconnected: m });
      },

      setPersonalPlaylist(tracks) {
        // Random initial cursor so two users who just disconnected from
        // the same shared station don't both land on the same first
        // personal track (would surface the "everyone hears the same
        // thing" pattern even after opt-out).
        const startIdx =
          tracks.length > 0 ? Math.floor(Math.random() * tracks.length) : 0;
        set({ personalPlaylist: tracks, personalIndex: startIdx });
      },

      nextPersonal() {
        const { personalPlaylist, personalIndex } = get();
        if (personalPlaylist.length === 0) return;
        set({ personalIndex: (personalIndex + 1) % personalPlaylist.length });
      },

      prevPersonal() {
        const { personalPlaylist, personalIndex } = get();
        if (personalPlaylist.length === 0) return;
        set({
          personalIndex:
            (personalIndex - 1 + personalPlaylist.length) %
            personalPlaylist.length,
        });
      },

      getCursorFor(scope) {
        if (!scope) return null;
        if (scope.kind === "city") return get().city;
        return get().pair[scope.id] ?? null;
      },

      getCurrentTrackId(now) {
        const { activeScope, tracksById } = get();
        const cursor = get().getCursorFor(activeScope);
        if (!cursor || cursor.playlistIds.length === 0) return null;
        // Walk playlist from started_at_ms, summing durations, until we
        // land in the bucket containing ``now``. Bounded by playlist
        // length (worst case full lap). For the common case the cursor
        // event has already advanced the index so the first iteration
        // wins.
        let anchorMs = cursor.startedAtMs;
        let index = cursor.cursorIndex;
        const len = cursor.playlistIds.length;
        for (let step = 0; step < len; step += 1) {
          const tid = cursor.playlistIds[index];
          if (!tid) return null;
          const duration = metaToDuration(tracksById[tid]);
          if (now < anchorMs + duration) {
            return tid;
          }
          anchorMs += duration;
          index = (index + 1) % len;
        }
        // ``now`` is more than a full lap ahead of the server cursor —
        // we lost the WS for a while. Return the last track and let the
        // next ``station.cursor`` event re-sync.
        return cursor.playlistIds[cursor.cursorIndex] ?? null;
      },
    }),
    {
      name: "lbt.station.v1",
      storage: createJSONStorage(() => {
        if (typeof window === "undefined") {
          return {
            getItem: () => null,
            setItem: () => undefined,
            removeItem: () => undefined,
          };
        }
        return window.localStorage;
      }),
      // Persist only the user-tweaked preferences. Cursors + tracks
      // are server-authoritative and re-hydrated on mount.
      partialize: (s) => ({
        connection: s.connection,
        mutedWhileDisconnected: s.mutedWhileDisconnected,
        personalIndex: s.personalIndex,
      }),
      version: 1,
    },
  ),
);

/** Selector: the current track meta for the active scope. */
export function selectStationTrack(
  s: StationState,
): StationTrackMeta | null {
  const id = s.getCurrentTrackId(Date.now());
  if (!id) return null;
  return s.tracksById[id] ?? null;
}

/** Selector: connection state for the currently-active scope (default
 *  "connected" when the scope hasn't been visited yet). */
export function selectActiveConnection(s: StationState): ConnectionState {
  if (!s.activeScope) return "connected";
  return s.connection[scopeKey(s.activeScope)] ?? "connected";
}

/** Selector: track ids of the cursor for the active scope, or [] when no
 *  cursor is set. Used by GlobalAudioMount's station-mode error budget to
 *  decide how many burst failures constitute "every track in the visible
 *  playlist is broken" and we should fall back to a local lo-fi loop. */
export function selectActivePlaylistIds(s: StationState): string[] {
  const cursor = s.getCursorFor(s.activeScope);
  return cursor?.playlistIds ?? [];
}
