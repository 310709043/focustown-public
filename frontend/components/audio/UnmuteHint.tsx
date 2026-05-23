"use client";

import { useTranslations } from "next-intl";

import { useAudioStore } from "@/lib/state/audioStore";
import { useStationStore } from "@/lib/state/stationStore";

/**
 * Floating "Tap to unmute" chip — visible only while muted autoplay is
 * in effect on /town's city scope. The actual unmute happens via the
 * document-level pointerdown listener in `<GlobalAudioMount/>`, but
 * this chip provides an explicit, accessible affordance and visually
 * signals "your audio is currently silent on purpose".
 *
 * Render gate: scope is the city station AND the audio is still locked.
 * Disconnected-personal mode also autoplays muted (per Phase 3 decision
 * #3), so the chip stays visible regardless of connection state — it
 * only depends on `audioUnlocked`.
 */
export function UnmuteHint() {
  const t = useTranslations("town.bottom.unmuteHint");
  const audioUnlocked = useAudioStore((s) => s.audioUnlocked);
  const activeScope = useStationStore((s) => s.activeScope);
  const unlock = useAudioStore((s) => s.unlock);

  if (audioUnlocked) return null;
  if (activeScope?.kind !== "city") return null;

  return (
    <button
      type="button"
      data-testid="audio-unmute-hint"
      aria-label={t("aria")}
      onClick={unlock}
      className="pixel-btn font-silkscreen"
      style={{
        position: "fixed",
        bottom: "calc(168px + 12px)",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 45,
        fontSize: 10,
        padding: "6px 12px",
        letterSpacing: "0.18em",
        borderColor: "var(--accent-3)",
        color: "var(--accent-3)",
        background: "rgba(13,18,28,0.85)",
        boxShadow: "0 0 12px rgba(34,211,238,0.45)",
      }}
    >
      🔊 {t("label")}
    </button>
  );
}
