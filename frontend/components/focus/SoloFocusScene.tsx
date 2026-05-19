"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { AmbientBackdrop } from "@/components/focus/ambient/AmbientBackdrop";
import { BigTimer } from "@/components/focus/BigTimer";
import { FocusTopBar } from "@/components/focus/FocusTopBar";
import { QuickActions } from "@/components/focus/QuickActions";
import { SessionInsight } from "@/components/focus/SessionInsight";
import { SoloNotesPanel } from "@/components/focus/SoloNotesPanel";
import { SoundMixer, type MixerVolumes } from "@/components/focus/SoundMixer";
import { TasksPanel } from "@/components/focus/TasksPanel";
import { findFocusBg, type FocusBgId } from "@/lib/data/focusBackgrounds";
import {
  PREF_SOUND_MIX,
  type SoundMixValue,
  usePreferencesStore,
} from "@/lib/state/preferencesStore";

const INITIAL_MIX: MixerVolumes = { music: 40, rain: 60, cafe: 30, fire: 0 };
const PERSIST_DEBOUNCE_MS = 500;

function mixerToPref(v: MixerVolumes): SoundMixValue {
  return { lofi: v.music, rain: v.rain, cafe: v.cafe, fire: v.fire };
}

function prefToMixer(v: SoundMixValue): MixerVolumes {
  return { music: v.lofi, rain: v.rain, cafe: v.cafe, fire: v.fire };
}

/**
 * Reference solo-room shell. Renders the gradient background + ambient
 * canvas overlay, the top bar, and the 3-column grid (1.05fr / 1.3fr /
 * 0.95fr) that hosts every solo panel. State that only matters to this
 * scene (current ambient bg, mixer volumes) lives here so the page-level
 * wrapper stays thin.
 *
 * QA round 1: dropped `<FriendsNow />` (soloing should feel solo —
 * seeing other people focusing is a distraction during deep work) and
 * `<AmbientPanel />` (the scene picker had no functional purpose since
 * the background already animates per-scene). Background is fixed to
 * the initial `rain` scene; it can be reintroduced later as a top-bar
 * dropdown if telemetry shows people want it back.
 */
export function SoloFocusScene() {
  const [bg] = useState<FocusBgId>("rain");
  const bgOption = findFocusBg(bg);

  // Hydrate the user-preference cache once on mount; the SoundMixer
  // reads its initial values from the store and PATCHes back on change
  // with a 500ms debounce so a single slider stroke doesn't fire N
  // requests.
  const ensureHydrated = usePreferencesStore((s) => s.ensureHydrated);
  const persistedMix = usePreferencesStore(
    (s) => (s.byKey[PREF_SOUND_MIX] as SoundMixValue | undefined),
  );
  const patch = usePreferencesStore((s) => s.patch);
  useEffect(() => {
    void ensureHydrated();
  }, [ensureHydrated]);

  const initialVolumes = useMemo<MixerVolumes>(
    () => (persistedMix ? prefToMixer(persistedMix) : INITIAL_MIX),
    // Initial render only; subsequent updates flow through `volumes`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [volumes, setVolumesLocal] = useState<MixerVolumes>(initialVolumes);

  // When the hydrate completes after first render, sync once.
  const hydratedAppliedRef = useRef(false);
  useEffect(() => {
    if (!persistedMix || hydratedAppliedRef.current) return;
    hydratedAppliedRef.current = true;
    setVolumesLocal(prefToMixer(persistedMix));
  }, [persistedMix]);

  const debounceTimerRef = useRef<number | null>(null);
  const handleMixerChange = (next: MixerVolumes) => {
    setVolumesLocal(next);
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = window.setTimeout(() => {
      void patch({ [PREF_SOUND_MIX]: mixerToPref(next) });
    }, PERSIST_DEBOUNCE_MS);
  };
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

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
          gridTemplateColumns: "1.05fr 1.3fr 0.95fr",
          gap: 12,
          padding: 12,
          position: "relative",
          zIndex: 2,
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
          <TasksPanel />
          <SoundMixer volumes={volumes} onChange={handleMixerChange} />
          <QuickActions />
        </div>
      </div>
    </main>
  );
}
