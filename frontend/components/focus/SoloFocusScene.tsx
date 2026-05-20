"use client";

import { BackdropLayer } from "@/components/focus/ambient/BackdropLayer";
import { BigTimer } from "@/components/focus/BigTimer";
import { FloatingMusicPlayer } from "@/components/audio/FloatingMusicPlayer";
import { FocusTopBar } from "@/components/focus/FocusTopBar";
import { FriendsNow } from "@/components/focus/FriendsNow";
import { NextEnvCard } from "@/components/focus/NextEnvCard";
import { QuickActions } from "@/components/focus/QuickActions";
import { SessionInsight } from "@/components/focus/SessionInsight";
import { SoloNotesPanel } from "@/components/focus/SoloNotesPanel";
import { SoundMixer } from "@/components/focus/SoundMixer";
import { TasksPanel } from "@/components/focus/TasksPanel";
import { findFocusBg, FOCUS_BG_OPTIONS } from "@/lib/data/focusBackgrounds";
import { useAmbientCycle } from "@/lib/hooks/useAmbientCycle";
import { useAmbientStore } from "@/lib/state/ambientStore";

/**
 * Solo focus room — reference parity (reference/screen-focus.jsx).
 *
 *   LEFT (2fr, wide):  `SoloNotesPanel` with the floating music player
 *                      anchored bottom-right.
 *   RIGHT (1fr, rail): `BigTimer` → `SessionInsight` → `FriendsNow` →
 *                      `TasksPanel` → `SoundMixer` → `NextEnvCard` →
 *                      `QuickActions`.
 *
 * The ambient backdrop is a two-stack of `BackdropLayer`s crossfading on
 * a 90 s cycle (25 s fade) driven by `useAmbientCycle`. No user-facing
 * picker — the picker was removed in the reference too; the only
 * override is the E2E lock at `localStorage.lowbatterytown.ambient.lock`.
 */
export function SoloFocusScene() {
  useAmbientCycle();
  const fromIdx = useAmbientStore((s) => s.fromIdx);
  const toIdx = useAmbientStore((s) => s.toIdx);
  const t01 = useAmbientStore((s) => s.t);

  // Defensive lookups so a transient out-of-bounds idx (e.g. during HMR
  // or a persist-driven mismatch) can't throw and bring the whole scene
  // down with an error boundary.
  const fromBg = (FOCUS_BG_OPTIONS[fromIdx] ?? FOCUS_BG_OPTIONS[0]).id;
  const toBg = (FOCUS_BG_OPTIONS[toIdx] ?? FOCUS_BG_OPTIONS[0]).id;
  void findFocusBg; // re-export keeps the helper bundled for tests.

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
        style={{
          position: "relative",
          zIndex: 2,
          display: "grid",
          gridTemplateColumns: "2fr 1fr",
          gap: 12,
          padding: 12,
          flex: 1,
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        {/* Left wide: notes + floating music player anchored bottom-right */}
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
          <FloatingMusicPlayer context="focus" contextId="solo" />
        </div>

        {/* Right rail — 7 reference panels in order */}
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
          <SessionInsight />
          <FriendsNow />
          <TasksPanel />
          <SoundMixer />
          <NextEnvCard />
          <QuickActions />
        </div>
      </div>
    </main>
  );
}
