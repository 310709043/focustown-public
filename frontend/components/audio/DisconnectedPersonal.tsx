"use client";

import { useTranslations } from "next-intl";

import { EQViz } from "@/components/town/bottom/EQViz";
import { useAudioStore } from "@/lib/state/audioStore";
import {
  useStationStore,
  type StationKind,
} from "@/lib/state/stationStore";

/**
 * Disconnected (personal) music surface.
 *
 * Shows when the user has stepped out of the shared cohort station.
 * Full personal controls: prev/next/play-pause/volume PLUS a Mute
 * toggle that EXCLUSIVELY exists in this state. The "Reconnect"
 * affordance stays prominent — the user can rejoin the cohort at any
 * time with one tap.
 *
 * Visual treatment: desaturated panel (saturate-50 + opacity dim) so
 * the player reads as "you stepped out" rather than "the same player
 * with extra buttons". The cohort metaphor only lands if the two
 * states feel different.
 */
interface Props {
  scopeKind: StationKind;
}

export function DisconnectedPersonal({ scopeKind }: Props) {
  const t = useTranslations("town.bottom.stationPlayer");
  const personalPlaylist = useStationStore((s) => s.personalPlaylist);
  const personalIndex = useStationStore((s) => s.personalIndex);
  const reconnect = useStationStore((s) => s.reconnect);
  const nextPersonal = useStationStore((s) => s.nextPersonal);
  const prevPersonal = useStationStore((s) => s.prevPersonal);

  const isPlaying = useAudioStore((s) => s.isPlaying);
  const volume = useAudioStore((s) => s.volume);
  const audioUnlocked = useAudioStore((s) => s.audioUnlocked);
  const toggle = useAudioStore((s) => s.toggle);
  const setVolume = useAudioStore((s) => s.setVolume);
  const unlock = useAudioStore((s) => s.unlock);

  const currentTrack = personalPlaylist[personalIndex] ?? null;
  const disabled = personalPlaylist.length === 0;
  const reconnectLabel =
    scopeKind === "city" ? t("reconnectCity") : t("reconnectPair");

  const onTogglePlay = async () => {
    if (!audioUnlocked) await unlock();
    toggle();
  };

  return (
    <div
      data-testid="station-disconnected"
      data-scope-kind={scopeKind}
      className="pixel-panel"
      style={{
        padding: 10,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        filter: "saturate(0.55) brightness(0.95)",
        opacity: 0.94,
      }}
    >
      {/* Header: "you stepped out" label + EQ */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 6,
        }}
      >
        <span
          className="font-silkscreen"
          style={{
            fontSize: 10,
            color: "var(--ink-dim)",
            letterSpacing: "0.2em",
          }}
        >
          {t("disconnectedLabel")}
        </span>
        <EQViz playing={isPlaying} />
      </div>

      {/* Personal track */}
      <div>
        <div
          style={{
            fontFamily: "var(--font-noto-sans-tc), monospace",
            fontSize: 12,
            color: "var(--ink)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {currentTrack?.title ?? t("playlistEmpty")}
        </div>
        <div
          className="font-silkscreen"
          style={{
            fontSize: 9,
            color: "var(--ink-dim)",
            letterSpacing: "0.12em",
            marginTop: 2,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {personalPlaylist.length > 0
            ? `${personalIndex + 1}/${personalPlaylist.length}${currentTrack?.artist ? ` · ${currentTrack.artist}` : ""}`
            : "—"}
        </div>
      </div>

      {/* Controls row: prev / play / next · volume · reconnect.
          Mute is implicit (drag volume to 0) so we can keep the panel
          within the 168 px BottomHUD band even on smaller viewports. */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <button
          type="button"
          data-testid="station-prev"
          aria-label={t("prevAria")}
          disabled={disabled}
          onClick={prevPersonal}
          className="pixel-btn"
          style={{
            padding: "4px 6px",
            fontSize: 10,
            opacity: disabled ? 0.4 : 1,
          }}
        >
          ◀◀
        </button>
        <button
          type="button"
          data-testid="station-toggle-play"
          aria-label={isPlaying ? t("pauseAria") : t("playAria")}
          disabled={disabled}
          onClick={onTogglePlay}
          className="pixel-btn primary"
          style={{
            padding: "4px 8px",
            fontSize: 10,
            opacity: disabled ? 0.4 : 1,
          }}
        >
          {isPlaying ? "⏸" : "▶"}
        </button>
        <button
          type="button"
          data-testid="station-next"
          aria-label={t("nextAria")}
          disabled={disabled}
          onClick={nextPersonal}
          className="pixel-btn"
          style={{
            padding: "4px 6px",
            fontSize: 10,
            opacity: disabled ? 0.4 : 1,
          }}
        >
          ▶▶
        </button>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(volume * 100)}
          onChange={(e) => setVolume(Number(e.target.value) / 100)}
          aria-label={t("volumeAria")}
          data-testid="station-volume"
          style={{
            flex: 1,
            minWidth: 48,
            height: 4,
            accentColor: "var(--accent-3)",
          }}
        />
        <button
          type="button"
          data-testid="station-reconnect"
          aria-label={reconnectLabel}
          onClick={reconnect}
          className="pixel-btn primary"
          style={{
            fontSize: 10,
            padding: "4px 8px",
            letterSpacing: "0.15em",
            borderColor: "var(--accent-3)",
            color: "var(--accent-3)",
            background: "rgba(34,211,238,0.06)",
            whiteSpace: "nowrap",
          }}
        >
          ⟲ {reconnectLabel}
        </button>
      </div>
    </div>
  );
}
