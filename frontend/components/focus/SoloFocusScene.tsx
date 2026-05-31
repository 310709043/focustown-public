"use client";

import { BackdropLayer } from "@/components/focus/ambient/BackdropLayer";
import { BigTimer } from "@/components/focus/BigTimer";
import { CatSupervisor } from "@/components/focus/CatSupervisor";
import { FloatingMusicPlayer } from "@/components/audio/FloatingMusicPlayer";
import { FocusTopBar } from "@/components/focus/FocusTopBar";
import { SessionInsight } from "@/components/focus/SessionInsight";
import { SoloNotesPanel } from "@/components/focus/SoloNotesPanel";
import { TasksPanel } from "@/components/focus/TasksPanel";
import { findFocusBg, FOCUS_BG_OPTIONS } from "@/lib/data/focusBackgrounds";
import { useAmbientCycle } from "@/lib/hooks/useAmbientCycle";
import { useAmbientStore } from "@/lib/state/ambientStore";

/**
 * Solo focus room.
 *
 *   LEFT (2fr, wide):  `SoloNotesPanel`.
 *   RIGHT (1fr, rail): `BigTimer` → `TasksPanel` (with today's-goal
 *                      strip merged into its header) → `SessionInsight`
 *                      (rotating tips).
 *   FLOATING:          `FloatingMusicPlayer` anchored bottom-right of
 *                      the whole viewport (sibling of the body grid).
 *
 * FriendsNow / SoundMixer / NextEnvCard panels were removed in the
 * 2026-05-20 QA round-1 pass. The ambient backdrop is still a two-stack
 * of `BackdropLayer`s crossfading on a 90 s cycle driven by
 * `useAmbientCycle`. No user-facing picker — the override is the E2E
 * lock at `localStorage.lowbatterytown.ambient.lock`.
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
        // Container query: keep the 2fr/1fr split on tablets and wider
        // (≥ 720px), stack vertically on phones so neither the notes pane
        // nor the timer pane gets crushed. Both panes stay mounted with
        // identical content — no element removed.
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

        {/* Right rail — BigTimer / TasksPanel (with goal strip) /
            SessionInsight tips. The DND / lock-phone / back-to-town
            QuickActions cluster was removed 2026-05-21 per QA. */}
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

      {/* Floating music player — anchored bottom-right of the whole
          viewport (sibling of the body grid, not nested in the notes
          column). Uses `position: absolute; right: 14; bottom: 14;` so
          it resolves against this <main> rather than the notes column. */}
      <FloatingMusicPlayer context="focus" contextId="solo" />
    </main>
  );
}
