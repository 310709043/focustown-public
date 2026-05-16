"use client";

import { useState } from "react";

import { AmbientBackdrop } from "@/components/focus/ambient/AmbientBackdrop";
import { AmbientPanel } from "@/components/focus/AmbientPanel";
import { BigTimer } from "@/components/focus/BigTimer";
import { FocusTopBar } from "@/components/focus/FocusTopBar";
import { FriendsNow } from "@/components/focus/FriendsNow";
import { QuickActions } from "@/components/focus/QuickActions";
import { SessionInsight } from "@/components/focus/SessionInsight";
import { SoloNotesPanel } from "@/components/focus/SoloNotesPanel";
import { SoundMixer, type MixerVolumes } from "@/components/focus/SoundMixer";
import { TasksPanel } from "@/components/focus/TasksPanel";
import { findFocusBg, type FocusBgId } from "@/lib/data/focusBackgrounds";

const INITIAL_MIX: MixerVolumes = { music: 40, rain: 60, cafe: 30, fire: 0 };

/**
 * Reference solo-room shell. Renders the gradient background + ambient
 * canvas overlay, the top bar, and the 3-column grid (1.05fr / 1.3fr /
 * 0.95fr) that hosts every solo panel. State that only matters to this
 * scene (current ambient bg, mixer volumes) lives here so the page-level
 * wrapper stays thin.
 */
export function SoloFocusScene() {
  const [bg, setBg] = useState<FocusBgId>("rain");
  const [volumes, setVolumes] = useState<MixerVolumes>(INITIAL_MIX);
  const bgOption = findFocusBg(bg);

  return (
    <main
      data-testid="focus-solo-scene"
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: bgOption.gradient,
        transition: "background 0.6s ease",
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          zIndex: 0,
        }}
      >
        <AmbientBackdrop bg={bg} />
      </div>

      <div style={{ position: "relative", zIndex: 2 }}>
        <FocusTopBar />
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "grid",
          gridTemplateColumns: "1.05fr 1.3fr 0.95fr",
          gap: 12,
          padding: 12,
          position: "relative",
          zIndex: 2,
          overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
          <BigTimer partnerId={null} />
          <SessionInsight />
        </div>

        <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
          <SoloNotesPanel />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
          <FriendsNow />
          <TasksPanel />
          <AmbientPanel value={bg} onChange={setBg} />
          <SoundMixer volumes={volumes} onChange={setVolumes} />
          <QuickActions />
        </div>
      </div>
    </main>
  );
}
