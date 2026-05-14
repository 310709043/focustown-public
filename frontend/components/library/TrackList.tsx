"use client";

import { useRef, useState } from "react";
import { clsx } from "clsx";
import { ApiError } from "@/lib/api/client";
import { tracksApi } from "@/lib/api/endpoints";
import type { Track } from "@/lib/api/types.gen";

type Props = {
  tracks: Track[];
  currentUserId: string | null;
  onDeleted: (trackId: string) => void;
  /** Track ids currently in the signed-in user's room playlist. Empty
   *  set when not logged in. */
  inPlaylist: Set<string>;
  onAddToRoom: (trackId: string) => void | Promise<void>;
  onRemoveFromRoom: (trackId: string) => void | Promise<void>;
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function TrackList({
  tracks,
  currentUserId,
  onDeleted,
  inPlaylist,
  onAddToRoom,
  onRemoveFromRoom,
}: Props) {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [playlistBusyId, setPlaylistBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});

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

  async function handleDelete(t: Track) {
    if (deletingId) return;
    const el = audioRefs.current[t.id];
    if (el) el.pause();
    setDeletingId(t.id);
    setError(null);
    try {
      await tracksApi.remove(t.id);
      onDeleted(t.id);
      if (playingId === t.id) setPlayingId(null);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "delete_failed";
      setError(msg);
    } finally {
      setDeletingId(null);
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
      <div className="text-xs text-muted py-8 text-center border border-border rounded">
        目前還沒有任何 track。上傳一首試試！
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {error && (
        <div className="text-[11px] text-red-400 border border-red-400/40 rounded px-2 py-1">
          {error}
        </div>
      )}
      <ul className="flex flex-col gap-1.5">
        {tracks.map((t) => {
          const mine = currentUserId !== null && t.uploaded_by_user_id === currentUserId;
          const isPlaying = playingId === t.id;
          return (
            <li
              key={t.id}
              className={clsx(
                "flex items-center gap-2 px-2 py-1.5 border rounded",
                isPlaying ? "border-accent-1 bg-accent-1/5" : "border-border",
              )}
            >
              <button
                type="button"
                onClick={() => handleToggle(t.id)}
                className="w-7 h-7 shrink-0 rounded-sm border border-accent-1 text-accent-1 hover:bg-accent-1/10"
                aria-label={isPlaying ? "pause" : "play"}
              >
                {isPlaying ? "⏸" : "▶"}
              </button>
              <div className="flex-1 min-w-0">
                <div className="text-xs truncate">{t.title}</div>
                <div className="text-[10px] text-muted truncate">
                  {t.artist ? `${t.artist} · ` : ""}
                  {t.mood} · {formatBytes(t.file_size_bytes)}
                </div>
              </div>
              {currentUserId !== null && (
                <button
                  type="button"
                  onClick={() => handleTogglePlaylist(t.id)}
                  disabled={playlistBusyId === t.id}
                  className={clsx(
                    "text-[10px] px-1.5 py-0.5 border rounded disabled:opacity-50",
                    inPlaylist.has(t.id)
                      ? "border-accent-1 text-accent-1 hover:border-red-400 hover:text-red-400"
                      : "border-border text-muted hover:border-accent-1 hover:text-accent-1",
                  )}
                  aria-pressed={inPlaylist.has(t.id)}
                >
                  {playlistBusyId === t.id
                    ? "…"
                    : inPlaylist.has(t.id)
                      ? "✓ 房間"
                      : "+ 加入房間"}
                </button>
              )}
              {mine && (
                <button
                  type="button"
                  onClick={() => handleDelete(t)}
                  disabled={deletingId === t.id}
                  className="text-[10px] px-1.5 py-0.5 border border-border rounded text-muted hover:border-red-400 hover:text-red-400 disabled:opacity-50"
                >
                  {deletingId === t.id ? "刪除中…" : "刪除"}
                </button>
              )}
              <audio
                ref={(el) => {
                  audioRefs.current[t.id] = el;
                }}
                src={tracksApi.streamUrl(t.id)}
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
