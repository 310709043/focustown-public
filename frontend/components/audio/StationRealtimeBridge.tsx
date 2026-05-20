"use client";

import { useEffect } from "react";

import {
  useStationStore,
  type StationCursorPayload,
  type StationKind,
} from "@/lib/state/stationStore";
import { useRealtime } from "@/lib/ws/useRealtime";

/**
 * Mount-once bridge that routes ``station.cursor`` WS events into the
 * shared station store.
 *
 * Lives alongside ``<GlobalAudioMount/>`` in the locale layout so it
 * survives page navigation. The backend never unsubscribes a user on
 * the per-user "disconnect" preference, so events keep arriving here
 * even when the user has stepped out — the store consults the
 * connection state when answering ``getCurrentTrackId``.
 */
export function StationRealtimeBridge() {
  const applyCursor = useStationStore((s) => s.applyCursor);

  useRealtime((msg) => {
    if (msg.type !== "station.cursor") return;
    // WsMessage's catch-all variant widens unknown fields. Narrow via
    // coercion the same way SyncedRoomPlayer handles music.* events.
    const kind = String(msg.kind) as StationKind;
    if (kind !== "city" && kind !== "pair") return;
    const payload: StationCursorPayload = {
      type: "station.cursor",
      kind,
      scope_id: String(msg.scope_id),
      playlist_ids: Array.isArray(msg.playlist_ids)
        ? msg.playlist_ids.map(String)
        : [],
      cursor_index: Number(msg.cursor_index ?? 0),
      started_at_ms: Number(msg.started_at_ms ?? 0),
      version: Number(msg.version ?? 0),
    };
    applyCursor(payload);
  });

  // Keep the store's clock-driven selectors responsive: re-render
  // subscribers every second so ``getCurrentTrackId(Date.now())``
  // crosses track-boundaries even when no new cursor event has
  // arrived yet (worker tick is 5s — UI shouldn't lag that long).
  useEffect(() => {
    const id = window.setInterval(() => {
      // Touch state with a no-op set so subscribers re-run. Cheap; the
      // alternative (forceUpdate per consumer) leaks the timing concern
      // into every UI surface that reads the cursor.
      useStationStore.setState((s) => s);
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  return null;
}
