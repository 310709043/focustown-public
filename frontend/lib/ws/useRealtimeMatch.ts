"use client";

import { useRealtime } from "./useRealtime";
import type { Match } from "@/lib/api/types.gen";

type Handlers = {
  /** Pairing landed for this user. Synthesizes a partial Match from the
   *  WS payload — ``reason`` is not carried in the frame. The new
   *  waiting-pool payload carries ``partner_id`` + ``partner_character_key``;
   *  the legacy ``MatchRealtimeLink`` payload only carries ``from``.
   *  We accept both shapes so a candidate receiving frames from either
   *  source gets a consistent Match object.
   *
   *  Note: the user no longer chooses Accept / Skip — the consumer
   *  side should auto-accept (see matchStore.applyProposed) and route
   *  into the focus room. The name "Proposed" survives at the WS
   *  layer for backwards compatibility with the backend frame name. */
  onProposed?: (match: Match) => void;
  /** A match you proposed has been accepted by the other side. */
  onAccepted?: (matchId: string) => void;
};

export function useRealtimeMatch({ onProposed, onAccepted }: Handlers) {
  useRealtime((msg) => {
    if (msg.type === "match.proposed" && onProposed) {
      const partnerId = String(msg.partner_id ?? msg.from ?? "");
      const partnerCharacterKey =
        msg.partner_character_key != null
          ? String(msg.partner_character_key)
          : null;
      onProposed({
        id: String(msg.match_id),
        requester_id: partnerId,
        candidate_id: partnerId,
        requester_character_key: partnerCharacterKey,
        candidate_character_key: partnerCharacterKey,
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
