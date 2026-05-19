"use client";

/**
 * Personal radio — pure UI shell consuming the global audio store.
 *
 * SRP: visual chrome only — panel + EQ + transport buttons + volume.
 * No DOM `<audio>` here; that lives in `<GlobalAudioMount />` (locale
 * layout). All state flows through `useAudioStore`, which means a
 * room's PersonalRadio, the town BottomHUD MusicPlayer, and the solo
 * FloatingMusicPlayer are all surfaces over the same single audio
 * element. Cross-route navigation never restarts playback.
 *
 * Mounted at:
 *   • `/town/room/[id]` — context="room"
 *   • (room scenes for future routes — keep the prop for OCP)
 */

import { clsx } from "clsx";
import { useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";

import type { PersonalPlaylistContext } from "@/lib/api/endpoints";
import {
  selectCurrentTrack,
  useAudioStore,
} from "@/lib/state/audioStore";

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
  const tracks = useAudioStore((s) => s.tracks);
  const index = useAudioStore((s) => s.index);
  const currentTrack = useAudioStore(selectCurrentTrack);
  const isPlaying = useAudioStore((s) => s.isPlaying);
  const audioUnlocked = useAudioStore((s) => s.audioUnlocked);
  const volume = useAudioStore((s) => s.volume);
  const setContext = useAudioStore((s) => s.setContext);
  const toggle = useAudioStore((s) => s.toggle);
  const unlock = useAudioStore((s) => s.unlock);
  const next = useAudioStore((s) => s.next);
  const prev = useAudioStore((s) => s.prev);
  const setVolume = useAudioStore((s) => s.setVolume);

  useEffect(() => {
    void setContext(context, contextId ?? null);
  }, [context, contextId, setContext]);

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
