"use client";

import { useFocusRoomStore } from "@/lib/state/focusRoomStore";

/**
 * Phase 8 — server-driven shared-room timer display.
 *
 * Pure presentational. Reads ``remainingSeconds`` from
 * ``focusRoomStore.timer`` and renders MM:SS. There is no local
 * setInterval: the value snaps to whatever the latest
 * ``room.timer_tick`` frame put there. Drift between two browsers is
 * impossible because both sides display the same server-truth value
 * within at most one tick (~1s).
 */
export function RoomTimer() {
  const timer = useFocusRoomStore((s) => s.timer);
  const remaining = timer.remainingSeconds;
  if (remaining == null) {
    return null;
  }
  const mins = String(Math.floor(remaining / 60)).padStart(2, "0");
  const secs = String(remaining % 60).padStart(2, "0");
  const total = timer.durationSeconds ?? 1;
  const pct = Math.max(0, Math.min(100, (1 - remaining / total) * 100));
  return (
    <div
      data-testid="room-timer"
      className="pixel-panel"
      style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}
    >
      <div
        className="font-silkscreen"
        style={{
          textAlign: "center",
          fontSize: 36,
          color: "var(--ink)",
          textShadow: "0 0 8px var(--accent)",
          letterSpacing: "0.1em",
        }}
        data-testid="room-timer-value"
      >
        {mins}:{secs}
      </div>
      <div
        style={{
          height: 8,
          background: "rgba(0,0,0,0.5)",
          border: "1px solid var(--panel-stroke)",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: "var(--accent)",
            transition: "width 0.3s linear",
          }}
        />
      </div>
    </div>
  );
}
