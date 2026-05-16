"use client";

/**
 * Personal radio — per-user, server-randomized local playlist.
 *
 * SRP-pure UI shell. All playlist + playback state lives in the shared
 * `useRadioPlaylist` hook (`lib/hooks/useRadioPlaylist.ts`); this
 * component owns the visual chrome (panel, EQ bars, transport buttons,
 * volume slider) plus the hidden `<audio>` element the hook binds to.
 *
 * Cross-route reuse:
 *   • `/focus/[id]` — `context="focus"`
 *   • `/town/room/[id]` — `context="room"`
 *   • `/town` (deprecated) — now wrapped by `<MusicPlayer>` which uses
 *     the same hook against `context="city"`
 */

import { clsx } from "clsx";
import { useTranslations } from "next-intl";
import { useMemo } from "react";

import type { PersonalPlaylistContext } from "@/lib/api/endpoints";
import { useRadioPlaylist } from "@/lib/hooks/useRadioPlaylist";

interface Props {
  context: PersonalPlaylistContext;
  contextId?: string | null;
  /** Visual label shown next to the EQ. Defaults derived from context. */
  label?: string;
  /** Class names for the outer panel, so callers can position it. */
  className?: string;
}

export function PersonalRadio({ context, contextId, label, className }: Props) {
  const t = useTranslations("town.personalRadio");
  const {
    tracks,
    index,
    currentTrack,
    audioUnlocked,
    isPlaying,
    volume,
    audioRef,
    toggle,
    unlock,
    next,
    prev,
    setVolume,
    onEnded,
  } = useRadioPlaylist({ context, contextId });

  const headerLabel = useMemo(
    () => label ?? (context === "city" ? t("headerCity") : t("headerPersonal")),
    [label, context, t],
  );

  const disabled = tracks.length === 0;

  return (
    <div
      className={clsx(
        "panel relative overflow-hidden flex flex-col gap-1 px-2.5 py-2 bg-card border border-border rounded",
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <div className="text-[10px] text-muted">🎵 {headerLabel}</div>
        <EqBars playing={isPlaying} />
      </div>

      <div className="text-[10px] truncate" style={{ color: "var(--a2)" }}>
        {currentTrack?.title ?? "—"}
      </div>
      <div className="text-[9px] text-muted truncate">
        {currentTrack?.artist ?? ""}
        {tracks.length > 0 ? ` · ${index + 1}/${tracks.length}` : ""}
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={prev}
          disabled={disabled}
          aria-label={t("prevAria")}
          className={clsx(
            "w-[22px] h-[22px] border rounded-sm",
            disabled
              ? "border-border text-muted opacity-40 cursor-not-allowed"
              : "border-border text-muted hover:border-accent-1 hover:text-accent-1",
          )}
        >
          ⏮
        </button>
        <button
          type="button"
          onClick={toggle}
          disabled={disabled}
          aria-label={isPlaying ? t("pauseAria") : t("playAria")}
          className={clsx(
            "w-[22px] h-[22px] border rounded-sm",
            disabled
              ? "border-border text-muted opacity-40 cursor-not-allowed"
              : "border-accent-1 text-accent-1",
          )}
        >
          {isPlaying ? "⏸" : "▶"}
        </button>
        <button
          type="button"
          onClick={next}
          disabled={disabled}
          aria-label={t("nextAria")}
          className={clsx(
            "w-[22px] h-[22px] border rounded-sm",
            disabled
              ? "border-border text-muted opacity-40 cursor-not-allowed"
              : "border-border text-muted hover:border-accent-1 hover:text-accent-1",
          )}
        >
          ⏭
        </button>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(volume * 100)}
          onChange={(e) => setVolume(Number(e.target.value) / 100)}
          aria-label={t("volumeAria")}
          className="flex-1"
        />
      </div>

      {!audioUnlocked && tracks.length > 0 ? (
        <button
          type="button"
          onClick={unlock}
          className="text-[10px] mt-1 px-2 py-1 rounded border border-amber text-amber hover:bg-amber/10"
        >
          🔊 點擊聆聽
        </button>
      ) : null}

      <audio
        ref={audioRef}
        preload="none"
        onEnded={onEnded}
        style={{ display: "none" }}
        aria-hidden
      />
    </div>
  );
}

function EqBars({ playing }: { playing: boolean }) {
  return (
    <div className="flex items-end gap-0.5 h-4">
      {Array.from({ length: 14 }).map((_, i) => {
        const h = 3 + ((i * 37) % 13);
        return (
          <span
            key={i}
            className="w-[3px] rounded-sm"
            style={{
              background: "linear-gradient(to top,var(--a3),var(--a2))",
              height: `${h}px`,
              opacity: playing ? 1 : 0.3,
            }}
          />
        );
      })}
    </div>
  );
}
