"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { PixelSprite } from "@/components/pixel/PixelSprite";
import { EQViz } from "@/components/town/bottom/EQViz";

const NOTE_TILE = `
..NN.
.NNN.
NNN..
NN...
NN...
NNNN.
.NN..
`;

/**
 * "ROOM SYNC" music panel — album-art tile + track title + transport.
 * EQ bar at the bottom uses the same SRP-extracted `<EQViz>` from Phase
 * C1's `<MusicPlayer>`. Reference: screen-buddy.jsx:L192-L228.
 *
 * Decorative this PR — real room-playlist sync is `roomPlaybackApi` which
 * lives in town/room. Wiring the buddy room to it is a follow-up.
 */
export function RoomMusic() {
  const t = useTranslations("focus.buddy.roomMusic");
  const [playing, setPlaying] = useState(true);

  return (
    <div
      data-testid="room-music"
      className="pixel-panel"
      style={{ padding: 12, display: "flex", flexDirection: "column", gap: 6 }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span
          className="font-silkscreen"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontSize: 10,
            color: "var(--accent-3)",
            letterSpacing: "0.2em",
          }}
        >
          <span
            aria-hidden
            className="animate-blinkSoft"
            style={{
              display: "inline-block",
              width: 6,
              height: 6,
              background: "var(--accent-3)",
              boxShadow: "var(--neon-glow-cyan)",
            }}
          />
          {t("header")}
        </span>
        <span
          className="font-silkscreen"
          style={{
            fontSize: 8,
            color: "var(--ink-dim)",
            letterSpacing: "0.2em",
          }}
        >
          {t("syncStatus")}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div
          style={{
            width: 36,
            height: 36,
            background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "var(--neon-glow)",
          }}
        >
          <PixelSprite sprite={NOTE_TILE} palette={{ N: "#0a0524" }} scale={2} />
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <span
            className="font-silkscreen"
            style={{ fontSize: 11, color: "var(--ink)" }}
          >
            {t("trackTitle")}
          </span>
          <span
            className="font-silkscreen"
            style={{
              fontSize: 9,
              color: "var(--accent-3)",
              letterSpacing: "0.1em",
            }}
          >
            {t("trackSubLine")}
          </span>
        </div>
        <button
          type="button"
          data-testid="room-music-toggle"
          aria-label={playing ? t("pauseAria") : t("playAria")}
          className="pixel-btn primary"
          style={{ padding: "4px 8px", fontSize: 10 }}
          onClick={() => setPlaying((p) => !p)}
        >
          {playing ? "⏸" : "▶"}
        </button>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <span
          className="font-silkscreen"
          style={{
            fontSize: 9,
            color: "var(--ink-dim)",
            letterSpacing: "0.1em",
            marginRight: 4,
          }}
        >
          EQ
        </span>
        <div style={{ flex: 1 }}>
          <EQViz playing={playing} />
        </div>
      </div>
    </div>
  );
}
