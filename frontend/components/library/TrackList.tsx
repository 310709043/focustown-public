"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ApiError } from "@/lib/api/client";
import { tracksApi } from "@/lib/api/endpoints";
import type { Track } from "@/lib/api/types.gen";

interface Props {
  tracks: Track[];
  /** Track ids currently in the signed-in user's room playlist. Empty
   *  set when not logged in. */
  inPlaylist: Set<string>;
  /** When false the playlist toggle is hidden (anonymous viewer). */
  canCurateRoom: boolean;
  onAddToRoom: (trackId: string) => void | Promise<void>;
  onRemoveFromRoom: (trackId: string) => void | Promise<void>;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Track list for `/town/library`. Each row is a `pixel-panel`; the
 * play button uses `pixel-btn` (primary when playing); the "add to
 * room" toggle uses `pixel-btn primary` when in-room (accent-2 pink)
 * and outline `pixel-btn` otherwise. Audio plays one track at a time
 * — selecting a new track pauses everything else.
 */
export function TrackList({
  tracks,
  inPlaylist,
  canCurateRoom,
  onAddToRoom,
  onRemoveFromRoom,
}: Props) {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [playlistBusyId, setPlaylistBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});
  const t = useTranslations("library.tracks");

  function handleToggle(id: string) {
    setError(null);
    // Pause everything else, then toggle the target.
    Object.entries(audioRefs.current).forEach(([key, el]) => {
      if (key !== id && el) el.pause();
    });
    const el = audioRefs.current[id];
    if (!el) return;
    if (el.paused) {
      el.play().catch((e) => setError(e instanceof Error ? e.message : "play_failed"));
      setPlayingId(id);
    } else {
      el.pause();
      setPlayingId(null);
    }
  }

  async function handleTogglePlaylist(trackId: string) {
    if (playlistBusyId) return;
    setPlaylistBusyId(trackId);
    setError(null);
    try {
      if (inPlaylist.has(trackId)) {
        await onRemoveFromRoom(trackId);
      } else {
        await onAddToRoom(trackId);
      }
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "playlist_failed";
      setError(msg);
    } finally {
      setPlaylistBusyId(null);
    }
  }

  if (tracks.length === 0) {
    return (
      <div
        data-testid="track-list-empty"
        className="pixel-panel font-silkscreen"
        style={{
          padding: 32,
          fontSize: 11,
          color: "var(--ink-mute)",
          textAlign: "center",
          letterSpacing: "0.1em",
        }}
      >
        {t("empty")}
      </div>
    );
  }

  return (
    <div
      data-testid="track-list"
      style={{ display: "flex", flexDirection: "column", gap: 8 }}
    >
      {error && (
        <div
          role="alert"
          className="pixel-panel"
          style={{
            padding: "6px 10px",
            fontSize: 11,
            color: "var(--coral)",
            borderColor: "var(--coral)",
          }}
        >
          {error}
        </div>
      )}
      <ul
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
          listStyle: "none",
          padding: 0,
          margin: 0,
        }}
      >
        {tracks.map((track) => {
          const isPlaying = playingId === track.id;
          const isInRoom = inPlaylist.has(track.id);
          return (
            <li
              key={track.id}
              data-testid="track-row"
              data-playing={isPlaying || undefined}
              className="pixel-panel"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 10px",
                background: isPlaying
                  ? "rgba(167,139,250,0.08)"
                  : "rgba(12,5,35,0.9)",
              }}
            >
              <button
                type="button"
                onClick={() => handleToggle(track.id)}
                className={isPlaying ? "pixel-btn primary" : "pixel-btn"}
                style={{
                  width: 34,
                  height: 34,
                  padding: 0,
                  fontSize: 12,
                  flexShrink: 0,
                }}
                aria-label={isPlaying ? t("pauseAria") : t("playAria")}
              >
                {isPlaying ? "⏸" : "▶"}
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  className="font-silkscreen"
                  style={{
                    fontSize: 12,
                    color: "var(--ink)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {track.title}
                </div>
                <div
                  className="font-silkscreen"
                  style={{
                    fontSize: 9,
                    color: "var(--ink-mute)",
                    letterSpacing: "0.08em",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {track.artist ? `${track.artist} · ` : ""}
                  #{track.mood} · {formatBytes(track.file_size_bytes)}
                </div>
              </div>
              {canCurateRoom && (
                <button
                  type="button"
                  onClick={() => handleTogglePlaylist(track.id)}
                  disabled={playlistBusyId === track.id}
                  data-in-room={isInRoom || undefined}
                  className={isInRoom ? "pixel-btn primary" : "pixel-btn"}
                  style={{
                    padding: "5px 10px",
                    fontSize: 10,
                    opacity: playlistBusyId === track.id ? 0.5 : 1,
                    cursor: playlistBusyId === track.id ? "wait" : "pointer",
                  }}
                  aria-pressed={isInRoom}
                >
                  {playlistBusyId === track.id
                    ? "…"
                    : isInRoom
                      ? t("inRoom")
                      : t("addToRoom")}
                </button>
              )}
              <audio
                ref={(el) => {
                  audioRefs.current[track.id] = el;
                }}
                src={tracksApi.streamUrl(track.id)}
                preload="none"
                onEnded={() => setPlayingId(null)}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
