"use client";

import { useFocusRoomStore } from "@/lib/state/focusRoomStore";

/**
 * Phase 8 — single-line status banner that mirrors the room state
 * machine. Drives the user-visible copy that's currently scattered
 * across ad-hoc spinners in /focus/[id]/page.tsx so the
 * "Waiting for partner" → "Partner ready" → "Focus session" → "Done!"
 * progression all lands in one place and updates from the same
 * WS-fed store.
 */
export function RoomStatusBanner() {
  const status = useFocusRoomStore((s) => s.status);
  const endedReason = useFocusRoomStore((s) => s.endedReason);
  const timer = useFocusRoomStore((s) => s.timer);

  const message = describe(status, endedReason, timer.remainingSeconds);
  return (
    <div
      data-testid="room-status-banner"
      className="pixel-panel"
      style={{
        padding: "8px 14px",
        fontSize: 12,
        textAlign: "center",
        color: "var(--ink)",
        letterSpacing: "0.15em",
      }}
    >
      {message}
    </div>
  );
}

function describe(
  status: ReturnType<typeof useFocusRoomStore.getState>["status"],
  endedReason: string | null,
  remainingSeconds: number | null,
): string {
  switch (status) {
    case null:
    case "open":
      return "WAITING FOR PARTNER…";
    case "both_joined":
      return "PARTNER READY — PRESS START";
    case "active": {
      if (remainingSeconds == null) {
        return "FOCUS SESSION";
      }
      const minutes = Math.ceil(remainingSeconds / 60);
      return `FOCUS SESSION — ${minutes} MIN REMAINING`;
    }
    case "ended":
      if (endedReason === "completed") return "DONE! GREAT FOCUS.";
      if (endedReason === "timeout") return "ROOM TIMED OUT";
      if (endedReason === "both_left") return "BOTH LEFT — ROOM CLOSED";
      return "ROOM CLOSED";
  }
}
