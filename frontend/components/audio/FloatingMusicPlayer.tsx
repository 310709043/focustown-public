"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";

import {
  selectCurrentTrack,
  useAudioStore,
} from "@/lib/state/audioStore";
import type { PersonalPlaylistContext } from "@/lib/api/endpoints";

interface FloatingMusicPlayerProps {
  /** Playlist context. Defaults to "city" so /town keeps working unchanged. */
  context?: PersonalPlaylistContext;
  /** Context id (e.g. "solo", match id). Defaults to "city". */
  contextId?: string | null;
}

/**
 * Floating mini music player — anchored bottom-right of its positioned
 * parent (typically the notes column on /focus/solo). Subscribes to the
 * global `useAudioStore`, so all play/pause/volume/track state is
 * shared with the town BottomHUD `MusicPlayer` and any room
 * `PersonalRadio`. No local audio element — DOM playback lives in
 * `<GlobalAudioMount />` mounted once in the locale layout.
 *
 * Hide / show:
 *   • Expanded (default): 280-wide pixel panel with title + transport.
 *   • Collapsed: 36×36 ▶/⏸ chip in the same corner.
 *   The `hidden` state persists across reloads (lbt.audio.v1 store).
 *
 * Aesthetic: CRT pixel panel — 1 px accent-3 border, inner stroke,
 * soft cyan glow when playing. Reuses the existing `pixel-panel` /
 * `pixel-btn` / `xp-cell` primitives to stay cohesive with the
 * Citizen ID card + SkyWindow chrome.
 */
export function FloatingMusicPlayer({
  context = "city",
  contextId = "city",
}: FloatingMusicPlayerProps = {}) {
  const t = useTranslations("focus.solo.floatingPlayer");
  const tracks = useAudioStore((s) => s.tracks);
  const index = useAudioStore((s) => s.index);
  const currentTrack = useAudioStore(selectCurrentTrack);
  const isPlaying = useAudioStore((s) => s.isPlaying);
  const volume = useAudioStore((s) => s.volume);
  const audioUnlocked = useAudioStore((s) => s.audioUnlocked);
  const hidden = useAudioStore((s) => s.hidden);
  const setContext = useAudioStore((s) => s.setContext);
  const toggle = useAudioStore((s) => s.toggle);
  const next = useAudioStore((s) => s.next);
  const prev = useAudioStore((s) => s.prev);
  const setVolume = useAudioStore((s) => s.setVolume);
  const unlock = useAudioStore((s) => s.unlock);
  const setHidden = useAudioStore((s) => s.setHidden);

  // Ensure a playlist is in place. The mounting screen passes its own
  // (context, contextId): /focus/solo → ("focus", "solo"); buddy room →
  // ("focus", matchId); /town → ("city", "city"). Default is "city" so
  // existing call sites with no props keep their pre-port behavior.
  useEffect(() => {
    void setContext(context, contextId);
  }, [setContext, context, contextId]);

  const disabled = tracks.length === 0;
  const trackTitle = currentTrack?.title ?? t("trackTitleFallback");
  const trackArtist = currentTrack?.artist ?? "";
  const subline =
    tracks.length > 0
      ? trackArtist
        ? `${trackArtist} · ${index + 1}/${tracks.length}`
        : `${index + 1}/${tracks.length}`
      : t("playlistEmpty");

  // Collapsed chip — a single 44×44 pill in the same corner.
  if (hidden) {
    return (
      <button
        type="button"
        data-testid="floating-music-toggle"
        aria-label={t("showAria")}
        onClick={() => setHidden(false)}
        className="pixel-btn animate-fadeUp"
        style={{
          position: "absolute",
          right: 14,
          bottom: 14,
          width: 44,
          height: 44,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 14,
          borderColor: "var(--accent-3)",
          color: "var(--accent-3)",
          background: "rgba(7,4,26,0.92)",
          boxShadow: isPlaying
            ? "0 0 18px rgba(34,211,238,0.5)"
            : "0 0 6px rgba(34,211,238,0.18)",
          zIndex: 10,
        }}
      >
        {isPlaying ? "♪" : "▶"}
      </button>
    );
  }

  return (
    <div
      data-testid="floating-music-player"
      className="pixel-panel animate-fadeUp"
      style={{
        position: "absolute",
        right: 14,
        bottom: 14,
        width: 288,
        background: "rgba(7,4,26,0.92)",
        border: "1px solid var(--accent-3)",
        boxShadow: isPlaying
          ? "0 0 18px rgba(34,211,238,0.45), inset 0 0 0 1px rgba(34,211,238,0.18)"
          : "0 8px 24px rgba(0,0,0,0.4), inset 0 0 0 1px rgba(34,211,238,0.08)",
        padding: 10,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        zIndex: 10,
        transition: "box-shadow 220ms ease",
      }}
    >
      {/* Title row + collapse */}
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
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 9,
            color: "var(--accent-3)",
            letterSpacing: "0.22em",
          }}
        >
          <span
            aria-hidden
            className={isPlaying ? "animate-blinkSoft" : undefined}
            style={{
              width: 6,
              height: 6,
              background: "var(--accent-3)",
              boxShadow: isPlaying ? "var(--neon-glow-cyan)" : "none",
            }}
          />
          {t("header")}
        </span>
        <button
          type="button"
          data-testid="floating-music-collapse"
          aria-label={t("hideAria")}
          onClick={() => setHidden(true)}
          className="font-silkscreen"
          style={{
            width: 20,
            height: 20,
            background: "transparent",
            border: "1px solid var(--panel-stroke)",
            color: "var(--ink-mute)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
            lineHeight: 1,
          }}
        >
          ✕
        </button>
      </div>

      {/* Track display — Noto Sans so lowercase Latin reads */}
      <div>
        <div
          style={{
            fontFamily: 'var(--font-noto-sans-tc), monospace',
            fontSize: 12,
            color: "var(--ink)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {trackTitle}
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
          {subline}
        </div>
      </div>

      {/* Transport row */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <button
          type="button"
          data-testid="floating-music-prev"
          aria-label={t("prevAria")}
          disabled={disabled}
          onClick={prev}
          className="pixel-btn"
          style={{
            width: 28,
            height: 28,
            padding: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
            opacity: disabled ? 0.4 : 1,
            cursor: disabled ? "not-allowed" : "pointer",
          }}
        >
          ◀◀
        </button>
        <button
          type="button"
          data-testid="floating-music-toggle-play"
          aria-label={isPlaying ? t("pauseAria") : t("playAria")}
          disabled={disabled}
          onClick={toggle}
          className="pixel-btn primary"
          style={{
            width: 36,
            height: 28,
            padding: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            opacity: disabled ? 0.4 : 1,
            cursor: disabled ? "not-allowed" : "pointer",
          }}
        >
          {isPlaying ? "⏸" : "▶"}
        </button>
        <button
          type="button"
          data-testid="floating-music-next"
          aria-label={t("nextAria")}
          disabled={disabled}
          onClick={next}
          className="pixel-btn"
          style={{
            width: 28,
            height: 28,
            padding: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
            opacity: disabled ? 0.4 : 1,
            cursor: disabled ? "not-allowed" : "pointer",
          }}
        >
          ▶▶
        </button>
        {/* Slim volume bar — segmented xp-cell primitives keep visual */}
        {/* cohesion with the Citizen ID card. */}
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginLeft: 4,
          }}
        >
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(volume * 100)}
            onChange={(e) => setVolume(Number(e.target.value) / 100)}
            aria-label={t("volumeAria")}
            style={{ flex: 1, height: 4, accentColor: "var(--accent-3)" }}
          />
          <span
            className="font-silkscreen"
            style={{
              fontSize: 9,
              color: "var(--ink-dim)",
              letterSpacing: "0.1em",
              minWidth: 24,
              textAlign: "right",
            }}
          >
            {Math.round(volume * 100)}
          </span>
        </div>
      </div>

      {!audioUnlocked && tracks.length > 0 ? (
        <button
          type="button"
          data-testid="floating-music-unlock"
          onClick={unlock}
          className="font-silkscreen"
          style={{
            alignSelf: "center",
            fontSize: 9,
            padding: "4px 10px",
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
