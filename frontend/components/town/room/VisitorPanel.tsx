"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { ApiError } from "@/lib/api/client";
import { roomVisitApi } from "@/lib/api/endpoints";
import type { RoomVisit } from "@/lib/api/types.gen";
import { useRealtime } from "@/lib/ws/useRealtime";
import { BlinkDot } from "@/components/pixel/BlinkDot";

/**
 * Phase 8 — visitor avatar strip rendered inside `slot:visitor`.
 *
 * Lifecycle:
 *   1. On mount → ``POST /rooms/{id}/visit`` to register the caller's
 *      session and ``GET /rooms/{id}/visitors`` to hydrate the panel.
 *      After a successful visit, send a WS ``join`` frame so this
 *      client's RedisPubSubPublisher subscribes to ``room:{id}`` events
 *      (the existing `kind === "join"` branch in `ws/router.py`).
 *   2. While mounted → ``useRealtime`` listens for
 *      ``room.visitor_joined`` / ``room.visitor_left`` deltas, scoped
 *      to ``roomId``.
 *   3. On unmount → best-effort ``POST /rooms/{id}/leave``. Abrupt
 *      browser-close leaves a stale row; a future cleanup job will
 *      reap orphans.
 *
 * SRP: this is the visitor session orchestrator. Avatar rendering is
 * inline because each tile is small; promoting to a separate
 * ``VisitorAvatar`` component would be premature without a second
 * consumer.
 *
 * Visitor info is intentionally generic (emoji + truncated id) for
 * this stint — the server's ``room.visitor_joined`` payload only carries
 * ``user_id`` + ``joined_at``. Enriching with character_key / display_name
 * is reserved for a follow-up (needs ``RoomVisitService`` to compose an
 * IUserReader and either embed it in the WS payload or expose a
 * ``GET /users/{id}`` lookup).
 */

type Props = {
  roomId: string;
  ownerUserId: string;
  currentUserId: string | null;
};

function shortId(uid: string): string {
  return uid.slice(0, 6);
}

export function VisitorPanel({ roomId, ownerUserId, currentUserId }: Props) {
  const [visitors, setVisitors] = useState<RoomVisit[]>([]);
  const [visitError, setVisitError] = useState(false);
  const t = useTranslations("town.room.visitor");
  const realtime = useRealtime((msg) => {
    if (msg.type === "room.visitor_joined" && msg.room_id === roomId) {
      const userId = String(msg.user_id);
      const joinedAt = String(msg.joined_at ?? new Date().toISOString());
      setVisitors((prev) =>
        prev.some((v) => v.visitor_user_id === userId)
          ? prev
          : [
              ...prev,
              {
                // The HTTP visit row id isn't carried in the WS event;
                // synthesizing a transient id is fine because we key
                // the list by visitor_user_id below.
                id: `ws-${userId}`,
                room_id: roomId,
                visitor_user_id: userId,
                joined_at: joinedAt,
              },
            ],
      );
    } else if (msg.type === "room.visitor_left" && msg.room_id === roomId) {
      const userId = String(msg.user_id);
      setVisitors((prev) => prev.filter((v) => v.visitor_user_id !== userId));
    }
  });

  // Track whether the visit POST succeeded so unmount only calls leave
  // when we actually own a session. Avoids spurious 204s on retries.
  const visitedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await roomVisitApi.visit(roomId);
        if (cancelled) return;
        visitedRef.current = true;
        // Tell the WS to subscribe to this room's channel so we hear
        // future visitor_joined / visitor_left events. The server's
        // ws/router.py has a ``kind === "join"`` branch that calls
        // ``pub.add_channels([room:{id}])`` for us.
        realtime.send({ type: "join", room_id: roomId });
        const list = await roomVisitApi.listVisitors(roomId);
        if (!cancelled) setVisitors(list);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError) {
          // 403 (invite_only without invite) or 400 (room_full) just
          // means we can't be in the panel; visiting will already have
          // been denied so there's nothing to clean up on unmount.
          setVisitError(true);
        } else {
          throw err;
        }
      }
    })();

    return () => {
      cancelled = true;
      if (!visitedRef.current) return;
      // Best-effort fire-and-forget leave. We can't await in a cleanup,
      // so a failed leave (network drop, page swap) leaves a stale row.
      // Stale-row cleanup is tracked as a v2 worker job in the plan.
      void roomVisitApi.leave(roomId).catch(() => {});
    };
  }, [roomId, realtime]);

  // Filter out the room owner (rendered separately by OwnerPlaque) and
  // also filter out the current user (your own row is implicit — being
  // in the room IS your visit).
  const renderable = visitors.filter(
    (v) =>
      v.visitor_user_id !== ownerUserId &&
      v.visitor_user_id !== currentUserId,
  );

  if (visitError || renderable.length === 0) {
    // Render nothing — empty visitor panels create dead UI weight that
    // competes visually with the OwnerPlaque. Owner-as-only-occupant is
    // the common case in MVP.
    return null;
  }

  return (
    <div
      className="pixel-panel absolute z-10 flex items-center"
      style={{
        left: 24,
        top: 24,
        padding: "8px 12px",
        gap: 8,
      }}
    >
      <span
        className="font-silkscreen"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          fontSize: 9,
          color: "var(--ink-mute)",
          letterSpacing: "0.2em",
        }}
      >
        <BlinkDot color="var(--accent-2)" />
        {t("panelLabel")}
      </span>
      {renderable.map((v) => (
        <span
          key={v.visitor_user_id}
          title={t("tooltipFmt", { userId: v.visitor_user_id, joinedAt: v.joined_at })}
          className="flex items-center"
          style={{
            fontSize: 12,
            padding: "3px 6px",
            border: "1px solid var(--panel-stroke)",
            background: "var(--button-fill)",
            borderRadius: 2,
            color: "var(--ink)",
            lineHeight: 1,
            gap: 4,
          }}
        >
          <span style={{ fontSize: 14 }}>👤</span>
          <span
            className="font-silkscreen"
            style={{ fontSize: 9, letterSpacing: "0.1em" }}
          >
            #{shortId(v.visitor_user_id)}
          </span>
        </span>
      ))}
    </div>
  );
}
