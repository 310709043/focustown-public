"use client";

import { StarField } from "@/components/pixel/StarField";
import {
  findFocusBg,
  type FocusBgId,
} from "@/lib/data/focusBackgrounds";

interface Props {
  bg: FocusBgId;
  /** Crossfade opacity in [0, 1]. Sub-1% layers skip rendering. */
  opacity: number;
}

/**
 * One full-bleed sky gradient + scene-specific particle overlay. Two
 * instances are stacked in `SoloFocusScene` and their opacities sum to 1
 * during the 25 s crossfade window.
 */
export function BackdropLayer({ bg, opacity }: Props) {
  if (opacity <= 0.01) return null;
  const option = findFocusBg(bg);
  return (
    <div
      aria-hidden
      data-testid={`backdrop-layer-${bg}`}
      style={{
        position: "absolute",
        inset: 0,
        opacity,
        transition: "opacity 0.4s ease",
        zIndex: 0,
        pointerEvents: "none",
        background: option.skyGradient,
      }}
    >
      <AmbientOverlay bg={bg} />
    </div>
  );
}

function AmbientOverlay({ bg }: { bg: FocusBgId }) {
  if (bg === "night") {
    return <StarField density={0.0006} />;
  }
  if (bg === "synth") {
    return (
      <StarField
        density={0.0005}
        palette={["#ffd1ec", "#c4b5fd", "#fce8a1"]}
      />
    );
  }
  if (bg === "dusk_cool") {
    return <StarField density={0.0003} palette={["#fff", "#fee7c8"]} />;
  }
  return null;
}
