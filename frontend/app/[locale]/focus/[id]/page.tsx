"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

import { useRouter } from "@/i18n/routing";
import { useAuthStore } from "@/lib/state/authStore";
import { useAuthGuard } from "@/lib/hooks/useAuthGuard";
import { useFocusRoomStore } from "@/lib/state/focusRoomStore";
import { useMatchStore } from "@/lib/state/matchStore";
import { useTimerStore } from "@/lib/state/timerStore";
import { matchesApi } from "@/lib/api/endpoints";
import { findCharacter } from "@/lib/data/characters";
import { realtime } from "@/lib/ws/client";
import { useRealtime } from "@/lib/ws/useRealtime";
import { RoomStatusBanner } from "@/components/focus/RoomStatusBanner";
import { RoomTimer } from "@/components/focus/RoomTimer";
import { SoloFocusScene } from "@/components/focus/SoloFocusScene";
import { BuddyFocusScene } from "@/components/focus-buddy/BuddyFocusScene";

/** Deep-purple pixel city silhouette: calm horizon, no window detail. */
function CitySilhouette() {
  const heights = useMemo(
    () => [54, 88, 42, 102, 70, 122, 60, 96, 78, 138, 82, 108, 64, 92, 116, 74, 100, 68],
    [],
  );
  return (
    <div className="absolute left-0 right-0 bottom-0 flex items-end z-[1] pointer-events-none">
      {heights.map((h, i) => (
        <div
          key={i}
          className="flex-1 mx-px"
          style={{
            height: h,
            background:
              "linear-gradient(to top, rgba(76,29,149,0.8), rgba(124,58,237,0.45))",
            borderTop: "1px solid rgba(167,139,250,0.25)",
            boxShadow: "0 -2px 12px rgba(124,58,237,0.18)",
          }}
        />
      ))}
    </div>
  );
}

function PixelMoon() {
  return (
    <div
      className="absolute z-[1] pointer-events-none animate-moonPulse"
      style={{
        top: "12%",
        right: "10%",
        width: 64,
        height: 64,
        borderRadius: "50%",
        background: "radial-gradient(circle at 33% 28%, #fffbeb, #fef3c7, #fcd34d)",
      }}
    />
  );
}

function Stars() {
  const stars = useMemo(() => {
    const out: { top: number; left: number; size: number; dur: number; delay: number }[] = [];
    let h = 314159;
    for (let i = 0; i < 90; i++) {
      h = (h * 16807) % 2147483647;
      const r1 = h / 2147483647;
      h = (h * 16807) % 2147483647;
      const r2 = h / 2147483647;
      out.push({
        top: r1 * 60,
        left: r2 * 100,
        size: r1 < 0.2 ? 2 : 1,
        dur: 1.5 + r2 * 3.5,
        delay: r1 * 5,
      });
    }
    return out;
  }, []);
  return (
    <div className="absolute inset-0 z-[0] pointer-events-none">
      {stars.map((s, i) => (
        <span
          key={i}
          className="absolute rounded-full bg-white animate-twinkle"
          style={
            {
              width: s.size,
              height: s.size,
              top: `${s.top}%`,
              left: `${s.left}%`,
              ["--d" as string]: `${s.dur}s`,
              ["--dl" as string]: `-${s.delay}s`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

/**
 * Delay before navigating back to /town once the room enters ``ended``.
 * Long enough for the "ended" overlay to register but short enough that
 * a partner-left flow doesn't leave the user staring at a dead room.
 */
const ROOM_ENDED_NAV_DELAY_MS = 3_000;

export default function FocusRoomPage() {
  const { ready } = useAuthGuard();
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { user, hydrate } = useAuthStore();
  const acceptedMatch = useMatchStore((s) => s.accepted);
  const [paired] = useState<boolean>(id !== "solo");
  const [partnerKey, setPartnerKey] = useState<string | null>(null);
  // `t` from focus.session was only used by the old paired-branch UI; the new
  // BuddyFocusScene owns its own i18n namespace.
  useTranslations("focus.session");
  const roomT = useTranslations("focus.room");

  // Phase 7 — server-driven shared room state. ``hydrate`` GETs the
  // snapshot; the second effect below auto-calls ``join`` on first
  // mount so the user's ``joined_at`` flips to a timestamp (drives the
  // "both_joined" transition once the partner also joins).
  const roomStatus = useFocusRoomStore((s) => s.status);
  const roomLoadStatus = useFocusRoomStore((s) => s.loadStatus);
  const roomErrorCode = useFocusRoomStore((s) => s.errorCode);
  const roomParticipants = useFocusRoomStore((s) => s.participants);
  const roomId = useFocusRoomStore((s) => s.roomId);
  const hydrateRoom = useFocusRoomStore((s) => s.hydrate);
  const joinRoom = useFocusRoomStore((s) => s.join);
  const resetRoom = useFocusRoomStore((s) => s.reset);
  const onRoomOpened = useFocusRoomStore((s) => s.onRoomOpened);
  const onRoomPartnerJoined = useFocusRoomStore((s) => s.onRoomPartnerJoined);
  const onRoomPartnerLeft = useFocusRoomStore((s) => s.onRoomPartnerLeft);
  const onRoomReady = useFocusRoomStore((s) => s.onRoomReady);
  const onRoomSessionStarted = useFocusRoomStore(
    (s) => s.onRoomSessionStarted,
  );
  const onRoomTimerTick = useFocusRoomStore((s) => s.onRoomTimerTick);
  const onRoomSessionCompleted = useFocusRoomStore(
    (s) => s.onRoomSessionCompleted,
  );
  const onRoomEnded = useFocusRoomStore((s) => s.onRoomEnded);

  useEffect(() => {
    if (!user) void hydrate();
  }, [user, hydrate]);

  // Hydrate + auto-join. The join is fire-and-forget: if the user is
  // not a participant the snapshot fetch already returned 404 and the
  // not-found banner renders below, so a second 404 from join() is
  // harmless. Reset on unmount so a hot-route-swap doesn't carry stale
  // state into the next room.
  useEffect(() => {
    if (!paired || !user) return;
    let cancelled = false;
    (async () => {
      await hydrateRoom(id);
      if (cancelled) return;
      // Only attempt join when the server says we belong (hydrate
      // surfaces ``not_found`` for non-members or missing rooms).
      const state = useFocusRoomStore.getState();
      if (state.loadStatus === "ready" && state.errorCode === null) {
        await joinRoom(id);
      }
    })();
    return () => {
      cancelled = true;
      resetRoom();
    };
  }, [paired, user, id, hydrateRoom, joinRoom, resetRoom]);

  // Phase 8 — dispatch room.* WS frames into the store. The
  // ``useRealtime`` hook subscribes to the WS singleton; the store
  // discriminates on ``room_id`` so foreign frames (stale from the
  // previous /focus/[id] page until the unsubscribe lands) are
  // ignored.
  useRealtime((msg) => {
    // The WsMessage union ends in an open ``{type: string}`` arm so
    // narrowing on ``msg.type`` widens the per-branch type to that arm
    // and loses the structural fields. Cast through ``unknown`` at the
    // dispatch boundary — each handler shape matches the backend frame
    // contract (see app/domain/services/room_realtime_link.py).
    switch (msg.type) {
      case "room.opened":
        onRoomOpened(msg as unknown as Parameters<typeof onRoomOpened>[0]);
        break;
      case "room.partner_joined":
        onRoomPartnerJoined(
          msg as unknown as Parameters<typeof onRoomPartnerJoined>[0],
        );
        break;
      case "room.partner_left":
        onRoomPartnerLeft(
          msg as unknown as Parameters<typeof onRoomPartnerLeft>[0],
        );
        break;
      case "room.ready":
        onRoomReady(msg as unknown as Parameters<typeof onRoomReady>[0]);
        break;
      case "room.session_started":
        onRoomSessionStarted(
          msg as unknown as Parameters<typeof onRoomSessionStarted>[0],
        );
        break;
      case "room.timer_tick":
        onRoomTimerTick(
          msg as unknown as Parameters<typeof onRoomTimerTick>[0],
        );
        break;
      case "room.session_completed":
        onRoomSessionCompleted(
          msg as unknown as Parameters<typeof onRoomSessionCompleted>[0],
        );
        break;
      case "room.ended":
        onRoomEnded(msg as unknown as Parameters<typeof onRoomEnded>[0]);
        break;
    }
  });

  // Send the explicit ``subscribe`` op once we know the canonical
  // room id (from the snapshot hydrate). The unsubscribe lands on
  // unmount so multiplexed frames from a previous room stop arriving.
  useEffect(() => {
    if (!paired || !roomId) return;
    const channel = `room:${roomId}`;
    realtime.send({ type: "subscribe", channel });
    return () => {
      realtime.send({ type: "unsubscribe", channel });
    };
  }, [paired, roomId]);

  // When the room flips to ``ended`` (partner left, session completed
  // and the worker tore it down, …) auto-route back to /town after a
  // brief delay so the user sees the ended overlay without needing to
  // click. Earlier flows required a manual back button.
  useEffect(() => {
    if (roomStatus !== "ended") return;
    const tid = setTimeout(() => {
      router.replace("/town");
    }, ROOM_ENDED_NAV_DELAY_MS);
    return () => clearTimeout(tid);
  }, [roomStatus, router]);

  // Guard against accidental tab close / hard reload while a session is in
  // flight. Only fires for browser-level navigation; client-side router.push
  // (e.g. FocusTopBar's back button) is intentionally not guarded — the
  // backend worker's 60s abandoned-session sweep handles those.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!useTimerStore.getState().session) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // Resolve the partner's character_key for the pairing header. The
  // happy path reuses the just-accepted match from the in-memory store
  // (no extra request). On reload (or deep-link) the store is empty, so
  // we fetch the match by id; if that 4xx's we silently fall back to a
  // "solo-looking" header — the session itself keeps working.
  useEffect(() => {
    if (!paired || !user) {
      setPartnerKey(null);
      return;
    }
    const derive = (m: { requester_id: string; candidate_id: string; requester_character_key: string | null; candidate_character_key: string | null }) =>
      m.requester_id === user.id ? m.candidate_character_key : m.requester_character_key;

    if (acceptedMatch && acceptedMatch.id === id) {
      setPartnerKey(derive(acceptedMatch));
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const m = await matchesApi.getById(id);
        if (!cancelled) setPartnerKey(derive(m));
      } catch {
        if (!cancelled) setPartnerKey(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [paired, user, id, acceptedMatch]);

  if (!ready) {
    return <RoomStatusOverlay title="LOADING..." />;
  }

  // Solo branch: render the Page 4 SoloFocusScene.
  if (!paired) {
    return <SoloFocusScene />;
  }

  // Phase 7 gating: render lifecycle states ahead of the buddy scene.
  // ``idle`` is the brief pre-hydrate window; treat it as loading.
  if (roomLoadStatus === "loading" || roomLoadStatus === "idle") {
    return <RoomStatusOverlay title={roomT("loading")} />;
  }
  if (roomLoadStatus === "error" && roomErrorCode === "not_found") {
    return (
      <RoomStatusOverlay
        title={roomT("notFoundTitle")}
        subtitle={roomT("notFoundSubtitle")}
        showBackButton
      />
    );
  }
  if (roomLoadStatus === "error") {
    return (
      <RoomStatusOverlay
        title={roomT("errorTitle")}
        subtitle={roomT("errorSubtitle")}
        showBackButton
      />
    );
  }
  if (roomStatus === "ended") {
    return (
      <RoomStatusOverlay
        title={roomT("endedTitle")}
        subtitle={roomT("endedSubtitle")}
      />
    );
  }
  if (
    roomStatus === "open" &&
    !roomParticipants.every((p) => p.joined_at !== null)
  ) {
    return (
      <RoomStatusOverlay
        title={roomT("waitingTitle")}
        subtitle={roomT("waitingSubtitle")}
      />
    );
  }

  // Paired branch: Page 5's BuddyFocusScene replaces the pre-port JSX.
  // Partner display name resolves from `findCharacter(partnerKey).name`
  // when we have the key; otherwise BuddyFocusScene's "Aria" fallback
  // keeps the room readable.
  const partnerCharacter = findCharacter(partnerKey);
  return (
    <>
      <BuddyFocusScene
        matchId={id}
        partnerKey={partnerKey}
        partnerName={partnerCharacter?.name ?? "Aria"}
      />
      {/* Phase 8 — server-driven status + timer overlay. Sits above
          the BuddyFocusScene so the user sees the lifecycle from the
          single WS-fed store regardless of which sub-component owned
          the local UI before. */}
      <div
        style={{
          position: "fixed",
          top: "max(64px, calc(env(safe-area-inset-top) + 56px))",
          right: 12,
          zIndex: 200,
          // Phones: shrink to fit so the banner never clips off the right
          // edge of a 375 px viewport. Tablet+: stays at the intended 220 px.
          width: "min(220px, calc(100vw - 24px))",
          display: "flex",
          flexDirection: "column",
          gap: 6,
          pointerEvents: "none",
        }}
      >
        <div style={{ pointerEvents: "auto" }}>
          <RoomStatusBanner />
        </div>
        {roomStatus === "active" ? (
          <div style={{ pointerEvents: "auto" }}>
            <RoomTimer />
          </div>
        ) : null}
      </div>
    </>
  );
}

function RoomStatusOverlay({
  title,
  subtitle,
  showBackButton,
}: {
  title: string;
  subtitle?: string;
  showBackButton?: boolean;
}) {
  const router = useRouter();
  const locale = useLocale();
  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center text-center px-6"
      style={{
        background:
          "radial-gradient(ellipse at top, rgba(76,29,149,0.85), rgba(15,23,42,0.95))",
      }}
      data-testid="focus-room-overlay"
    >
      <Stars />
      <PixelMoon />
      <div className="relative z-[2] max-w-md">
        <p className="text-amber-200/90 text-2xl font-semibold tracking-wide">
          {title}
        </p>
        {subtitle ? (
          <p className="text-white/70 mt-3 text-sm leading-relaxed">
            {subtitle}
          </p>
        ) : null}
        {showBackButton ? (
          <button
            type="button"
            onClick={() => router.push(`/${locale}/town`)}
            className="pixel-btn primary mt-6"
            style={{ fontSize: 11, padding: "8px 20px", minHeight: 44 }}
          >
            ← Back to Town
          </button>
        ) : null}
      </div>
      <CitySilhouette />
    </div>
  );
}
