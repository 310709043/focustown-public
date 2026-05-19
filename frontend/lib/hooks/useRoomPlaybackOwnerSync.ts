"use client";

import { useEffect, useRef } from "react";

import { roomPlaybackApi } from "@/lib/api/endpoints";
import { selectCurrentTrack, useAudioStore } from "@/lib/state/audioStore";

/**
 * Owner-side bridge: forwards `<PersonalRadio context="room">` state
 * changes into `RoomPlaybackService` so visitors mirroring the same
 * room timeline (`<SyncedRoomPlayer>`) get the WS
 * `music.{play,pause,change}` events they subscribe to.
 *
 * Only fires when:
 *   1. `enabled` (caller passes `isOwner`)
 *   2. `audioStore.context === "room"` (PersonalRadio is on a room surface)
 *   3. The audio store has a current backend-known track id
 *
 * State machine — guarded by `lastAnnouncedTrackRef`:
 *   - First time a non-`local:` trackId enters the room context and
 *     `isPlaying` becomes true → `change(trackId)` (announces +
 *     starts the visitor timeline).
 *   - Track id flips → `change(newTrackId)` (resets visitor offset).
 *   - Same announced track id, `isPlaying` toggles → `play()` / `pause()`.
 *   - `isPlaying=false` before we ever announced → stay silent (visitors
 *     see an empty room until the owner actually plays).
 *
 * Server-side endpoints are owner-scoped (`/me/room/playback/*`), so
 * visitor mounts of this hook would 4xx; gating on `enabled=isOwner`
 * short-circuits the calls before they hit the network.
 */
export function useRoomPlaybackOwnerSync(enabled: boolean) {
  const context = useAudioStore((s) => s.context);
  const isPlaying = useAudioStore((s) => s.isPlaying);
  const currentTrack = useAudioStore(selectCurrentTrack);
  const trackId = currentTrack?.id ?? null;

  // Last value we successfully forwarded to backend. Persists across
  // `enabled` flips so that the false→true transition (e.g. room
  // payload arrives after first render) does not re-fire `change()`.
  const lastAnnouncedTrackRef = useRef<string | null>(null);
  const lastAnnouncedPlayingRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (!enabled || context !== "room" || !trackId) return;
    // `local:` ids point at static fallback MP3s on the browser only —
    // no backend track row, so forwarding would 404. Skip silently.
    if (trackId.startsWith("local:")) return;

    const trackChanged = trackId !== lastAnnouncedTrackRef.current;
    const playingChanged = isPlaying !== lastAnnouncedPlayingRef.current;

    if (trackChanged) {
      // Always announce the new track if it's about to play OR if we
      // already had a different one announced (visitors need the
      // current-track update either way). When isPlaying=false on a
      // fresh mount, stay quiet — visitors see "silent room" until the
      // owner actually clicks play.
      const hadPrior = lastAnnouncedTrackRef.current !== null;
      if (isPlaying || hadPrior) {
        lastAnnouncedTrackRef.current = trackId;
        lastAnnouncedPlayingRef.current = isPlaying;
        void roomPlaybackApi.change(trackId).catch(() => {
          /* visitor / not-owner / network — fire-and-forget */
        });
        // If the new track is paused, the backend `change` started a
        // timeline; immediately pause it so visitors freeze instead of
        // listening to silence.
        if (!isPlaying) {
          void roomPlaybackApi.pause().catch(() => {});
        }
      }
      return;
    }

    if (playingChanged) {
      lastAnnouncedPlayingRef.current = isPlaying;
      if (lastAnnouncedTrackRef.current === null) {
        // First play after a quiet mount — backend doesn't know the
        // track yet; announce via change() instead of bare play().
        lastAnnouncedTrackRef.current = trackId;
        void roomPlaybackApi.change(trackId).catch(() => {});
        return;
      }
      if (isPlaying) {
        void roomPlaybackApi.play().catch(() => {});
      } else {
        void roomPlaybackApi.pause().catch(() => {});
      }
    }
  }, [enabled, context, trackId, isPlaying]);
}
