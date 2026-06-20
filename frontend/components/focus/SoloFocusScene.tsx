"use client";

import { useEffect, useRef, useState } from "react";

import { BackdropLayer } from "@/components/focus/ambient/BackdropLayer";
import { BigTimer } from "@/components/focus/BigTimer";
import { CatSupervisor } from "@/components/focus/CatSupervisor";
import { FloatingMusicPlayer } from "@/components/audio/FloatingMusicPlayer";
import { FocusTopBar } from "@/components/focus/FocusTopBar";
import { SessionCompleteOverlay } from "@/components/focus/SessionCompleteOverlay";
import { SessionInsight } from "@/components/focus/SessionInsight";
import { SoloNotesPanel } from "@/components/focus/SoloNotesPanel";
import { TasksPanel } from "@/components/focus/TasksPanel";
import { findFocusBg, FOCUS_BG_OPTIONS } from "@/lib/data/focusBackgrounds";
import { useAmbientCycle } from "@/lib/hooks/useAmbientCycle";
import { useAmbientStore } from "@/lib/state/ambientStore";
import { useTimerStore } from "@/lib/state/timerStore";

/**
 * Solo focus room.
 *
 *   LEFT (2fr, wide):  `SoloNotesPanel`.
 *   RIGHT (1fr, rail): `BigTimer` → `TasksPanel` (with today's-goal
 *                      strip merged into its header) → `SessionInsight`
 *                      (rotating tips).
 *   FLOATING:          `FloatingMusicPlayer` anchored bottom-right of
 *                      the whole viewport (sibling of the body grid).
 */
export function SoloFocusScene() {
  useAmbientCycle();

  const [showComplete, setShowComplete] = useState(false);

  // Track the previous session + mode so we can detect the focus→complete
  // transition without firing on pause, reset, or break completions.
  const prevSessionRef = useRef<boolean>(false);
  const prevModeRef = useRef<string>("focus");

  const session = useTimerStore((s) => s.session);
  const running = useTimerStore((s) => s.running);
  const mode = useTimerStore((s) => s.mode);

  useEffect(() => {
    const hadSession = prevSessionRef.current;
    const wasFocus = prevModeRef.current === "focus";
    const completedNow = hadSession && !session && !running;
    if (completedNow && wasFocus) {
      setShowComplete(true);
    }
    prevSessionRef.current = !!session;
    prevModeRef.current = mode;
  }, [session, running, mode]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!useTimerStore.getState().session) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  const fromIdx = useAmbientStore((s) => s.fromIdx);
  const toIdx = useAmbientStore((s) => s.toIdx);
  const t01 = useAmbientStore((s) => s.t);

  const fromBg = (FOCUS_BG_OPTIONS[fromIdx] ?? FOCUS_BG_OPTIONS[0]).id;
  const toBg = (FOCUS_BG_OPTIONS[toIdx] ?? FOCUS_BG_OPTIONS[0]).id;
  void findFocusBg;

  return (
    <main
      data-testid="focus-solo-scene"
      className="crt"
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: "#02020a",
      }}
    >
      {/* Two stacked backdrops crossfading by opacity */}
      <BackdropLayer bg={fromBg} opacity={1 - t01} />
      <BackdropLayer bg={toBg} opacity={t01} />

      {/* Reading-comfort overlay — darkens bright skies so UI stays readable */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 1,
          pointerEvents: "none",
          background:
            "radial-gradient(ellipse at center, rgba(7,4,26,0.35) 0%, rgba(7,4,26,0.62) 75%, rgba(7,4,26,0.78) 100%)",
        }}
      />

      <div style={{ position: "relative", zIndex: 2, flexShrink: 0 }}>
        <FocusTopBar />
      </div>

      <div
        data-testid="solo-body-grid"
        className="solo-body-grid"
        style={{
          position: "relative",
          zIndex: 2,
          padding: 12,
          flex: 1,
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        {/* Left wide: notes panel only — music player lifted to <main> */}
        <div
          data-testid="notes-panel"
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            minWidth: 0,
          }}
        >
          <SoloNotesPanel />
        </div>

        {/* Right rail */}
        <div
          data-testid="solo-right-rail"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            overflow: "auto",
            paddingRight: 4,
            minHeight: 0,
            minWidth: 0,
          }}
        >
          <BigTimer partnerId={null} />
          <TasksPanel />
          <SessionInsight />
          <CatSupervisor />
        </div>
      </div>

      <FloatingMusicPlayer context="focus" contextId="solo" />

      <SessionCompleteOverlay
        visible={showComplete}
        onDismiss={() => setShowComplete(false)}
      />
    </main>
  );
}
