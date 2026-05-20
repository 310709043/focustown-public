"use client";

import { useTranslations } from "next-intl";

import { EQViz } from "@/components/town/bottom/EQViz";
import { PixelSprite } from "@/components/pixel/PixelSprite";
import { NOTE } from "@/lib/pixel/sprites/props";
import {
  selectStationTrack,
  useStationStore,
  type StationKind,
} from "@/lib/state/stationStore";
import { useAudioStore } from "@/lib/state/audioStore";

/**
 * Connected (shared cohort) music surface.
 *
 * The "we're listening together" view. By design it has exactly ONE
 * affordance: ``Disconnect``. No prev/next, no volume slider, no mute
 * — full immersion or step out, no middle. The point is to commit to
 * the cohort experience; partial controls would dilute the metaphor.
 *
 * Visual cues:
 *   • Pulsing cyan accent + live ``listeners`` count signals "this is
 *     happening RIGHT NOW with N other people".
 *   • EQ viz scaled up vs. the disconnected variant.
 *   • Disconnect button uses a chain-link / step-out glyph instead of
 *     a generic ✕ so the affordance reads as "leave the circle" not
 *     "close the player".
 */
interface Props {
  scopeKind: StationKind;
  listenerCount?: number;
}

export function ConnectedShared({ scopeKind, listenerCount }: Props) {
  const t = useTranslations("town.bottom.stationPlayer");
  const track = useStationStore(selectStationTrack);
  const disconnect = useStationStore((s) => s.disconnect);
  const audioUnlocked = useAudioStore((s) => s.audioUnlocked);
  const unlock = useAudioStore((s) => s.unlock);

  const headerLabel =
    scopeKind === "city" ? t("cityHeader") : t("pairHeader");

  return (
    <div
      data-testid="station-connected"
      data-scope-kind={scopeKind}
      className="pixel-panel"
      style={{
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Header: kind label + live indicator + EQ */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 6,
        }}
      >
        <div
          className="font-silkscreen"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 10,
            color: "var(--accent-3)",
            letterSpacing: "0.2em",
          }}
        >
          <PixelSprite sprite={NOTE.sprite} palette={NOTE.palette} scale={1.4} />
          <span>{headerLabel}</span>
        </div>
        <EQViz playing={!!track} />
      </div>

      {/* Track display */}
      <div>
        <div
          style={{
            fontFamily: "var(--font-noto-sans-tc), monospace",
            fontSize: 13,
            color: "var(--ink)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {track?.title ?? t("loadingTrack")}
        </div>
        <div
          className="font-silkscreen"
          style={{
            fontSize: 9,
            color: "var(--ink-dim)",
            letterSpacing: "0.12em",
            marginTop: 2,
          }}
        >
          {track?.artist ?? "—"}
        </div>
      </div>

      {/* Live "N listening" + step-out affordance */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          marginTop: 2,
        }}
      >
        <div
          className="font-silkscreen"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 9,
            color: "var(--accent-2)",
            letterSpacing: "0.18em",
          }}
        >
          <span
            aria-hidden
            className="animate-blinkSoft"
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "var(--accent-3)",
              boxShadow: "0 0 6px rgba(34,211,238,0.7)",
            }}
          />
          {listenerCount != null
            ? t("listeners", { count: listenerCount })
            : t("listenersUnknown")}
        </div>
        <button
          type="button"
          data-testid="station-disconnect"
          aria-label={t("disconnectAria")}
          className="pixel-btn"
          style={{
            fontSize: 9,
            padding: "4px 8px",
            letterSpacing: "0.18em",
            borderColor: "var(--accent-2)",
            color: "var(--accent-2)",
          }}
          onClick={disconnect}
        >
          ⌇ {t("disconnect")}
        </button>
      </div>

      {!audioUnlocked ? (
        <button
          type="button"
          data-testid="station-unlock"
          onClick={unlock}
          className="font-silkscreen"
          style={{
            alignSelf: "stretch",
            fontSize: 9,
            padding: "4px 8px",
            border: "1px solid var(--accent-4)",
            color: "var(--accent-4)",
            background: "transparent",
            cursor: "pointer",
            letterSpacing: "0.15em",
          }}
        >
          🔊 {t("unlockHint")}
        </button>
      ) : null}
    </div>
  );
}
