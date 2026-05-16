"use client";

import { useRealtime } from "./useRealtime";
import type { Match } from "@/lib/api/types.gen";

type Handlers = {
  /** Another user proposed a match with you. Synthesizes a partial Match
   *  from the WS payload — `reason` and `candidate_id` are best-effort
   *  because the WS frame does not carry them. The recipient sees the
   *  proposer in the candidate slot. */
  onProposed?: (match: Match) => void;
  /** A match you proposed has been accepted by the other side. */
  onAccepted?: (matchId: string) => void;
};

export function useRealtimeMatch({ onProposed, onAccepted }: Handlers) {
  useRealtime((msg) => {
    if (msg.type === "match.proposed" && onProposed) {
      onProposed({
        id: String(msg.match_id),
        requester_id: String(msg.from),
        candidate_id: String(msg.from),
        requester_character_key: null,
        candidate_character_key: null,
        compatibility: Number(msg.compatibility),
        reason: "",
        status: "pending",
        created_at: new Date().toISOString(),
      });
    } else if (msg.type === "match.accepted" && onAccepted) {
      onAccepted(String(msg.match_id));
    }
  });
}
