"use client";

import { useRealtime } from "./useRealtime";

export function useRealtimeSessionCompleted(
  onCompleted: (sessionId: string) => void,
) {
  useRealtime((msg) => {
    if (msg.type === "session.completed") {
      onCompleted(String(msg.session_id));
    }
  });
}
