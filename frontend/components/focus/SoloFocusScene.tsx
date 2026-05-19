"use client";

import { useState } from "react";

import { AmbientBackdrop } from "@/components/focus/ambient/AmbientBackdrop";
import { BigTimer } from "@/components/focus/BigTimer";
import { FocusTopBar } from "@/components/focus/FocusTopBar";
import { SoloNotesPanel } from "@/components/focus/SoloNotesPanel";
import { TasksPanel } from "@/components/focus/TasksPanel";
import { FloatingMusicPlayer } from "@/components/audio/FloatingMusicPlayer";
import { findFocusBg, type FocusBgId } from "@/lib/data/focusBackgrounds";

/**
 * Solo focus room — 2-column layout (goal round 4).
 *
 *   LEFT (fixed-ish, 320 px): TasksPanel (today's goal absorbed) +
 *                              BigTimer.
 *   RIGHT (1fr, grows to viewport edge):
 *                              SoloNotesPanel (flex:1, fills height) +
 *                              FloatingMusicPlayer in bottom-right corner
 *                              (user-hideable; collapses to a 44×44 chip).
 *
 * Dropped from earlier iterations:
 *   • `SessionInsight` — merged into TasksPanel.
 *   • `SoundMixer` — deleted entirely (no real audio fan-out behind it).
 *   • `QuickActions` — out of the new layout.
 *   • `FriendsNow`, `AmbientPanel` — already removed in round 1.
 *
 * Music is now owned by the global `useAudioStore` + `<GlobalAudioMount>`
 * in the locale layout; this scene only renders the visual player.
 * Navigating between /town and /focus/[id] never restarts playback.
 */
export function SoloFocusScene() {
  // Background scene is fixed to "rain" — the AmbientPanel picker that
  // would let users change it was rejected as having no purpose; we'll
  // revisit ambient backdrops as a top-bar dropdown if telemetry shows
  // it back.
  const [bg] = useState<FocusBgId>("rain");
  const bgOption = findFocusBg(bg);

  return (
    <main
      data-testid="focus-solo-scene"
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        overflowX: "hidden",
        overflowY: "auto",
        background: bgOption.gradient,
        transition: "background 0.6s ease",
      }}
    >
      {/* Ambient backdrop sticks to the viewport; the scrolling main
          slides over it. `position: fixed` keeps it from scrolling away
          when the right column overflows on shorter viewports. */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          zIndex: 0,
        }}
      >
        <AmbientBackdrop bg={bg} />
      </div>

      <div style={{ position: "relative", zIndex: 2, flexShrink: 0 }}>
        <FocusTopBar />
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "grid",
          gridTemplateColumns: "minmax(280px, 340px) 1fr",
          gap: 12,
          padding: 12,
          position: "relative",
          zIndex: 2,
        }}
      >
        {/* LEFT column — tasks (today's goal merged) above the big timer */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            minWidth: 0,
          }}
        >
          <TasksPanel />
          <BigTimer partnerId={null} />
        </div>

        {/* RIGHT column — notes fill the height; floating player anchors
            absolutely in the bottom-right of THIS positioned wrapper. */}
        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
          }}
        >
          <SoloNotesPanel />
          <FloatingMusicPlayer />
        </div>
      </div>
    </main>
  );
}
