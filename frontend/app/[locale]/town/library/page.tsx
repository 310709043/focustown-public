"use client";

import { useEffect, useState } from "react";
import { Link, useRouter } from "@/i18n/routing";
import { ApiError } from "@/lib/api/client";
import { roomTracksApi, tracksApi } from "@/lib/api/endpoints";
import type { Track } from "@/lib/api/types.gen";
import { useAuthStore } from "@/lib/state/authStore";
import { MoodTabs, type MoodKey } from "@/components/library/MoodTabs";
import { TrackList } from "@/components/library/TrackList";
import { UploadForm } from "@/components/library/UploadForm";

export default function LibraryPage() {
  const router = useRouter();
  const { user, hydrate } = useAuthStore();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [mood, setMood] = useState<MoodKey>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inPlaylist, setInPlaylist] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!user) void hydrate();
  }, [user, hydrate]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const filter = mood === "all" ? undefined : mood;
    tracksApi
      .list(filter)
      .then((rows) => {
        if (!cancelled) setTracks(rows);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof ApiError ? e.message : "load_failed");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mood]);

  useEffect(() => {
    if (!user) {
      setInPlaylist(new Set());
      return;
    }
    let cancelled = false;
    roomTracksApi
      .list()
      .then((rows) => {
        if (!cancelled) setInPlaylist(new Set(rows.map((r) => r.track_id)));
      })
      .catch(() => {
        if (!cancelled) setInPlaylist(new Set());
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  function handleUploaded(track: Track) {
    setTracks((prev) => [track, ...prev]);
  }

  function handleDeleted(trackId: string) {
    setTracks((prev) => prev.filter((t) => t.id !== trackId));
    setInPlaylist((prev) => {
      if (!prev.has(trackId)) return prev;
      const next = new Set(prev);
      next.delete(trackId);
      return next;
    });
  }

  async function handleAddToRoom(trackId: string) {
    await roomTracksApi.add(trackId);
    setInPlaylist((prev) => new Set(prev).add(trackId));
  }

  async function handleRemoveFromRoom(trackId: string) {
    await roomTracksApi.remove(trackId);
    setInPlaylist((prev) => {
      const next = new Set(prev);
      next.delete(trackId);
      return next;
    });
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <div>
          <div className="text-[10px] text-muted">FOCUS TOWN / LIBRARY</div>
          <h1 className="text-lg font-semibold">音樂庫</h1>
        </div>
        <button
          type="button"
          onClick={() => router.push("/town")}
          className="text-[11px] px-3 py-1 border border-border rounded text-muted hover:border-accent-1 hover:text-accent-1"
        >
          ← 回小鎮
        </button>
      </header>

      <p className="text-[11px] text-muted leading-relaxed">
        所有使用者共享的音樂庫。Phase 6 Tier-2：可上傳 MP3，未來
        <Link className="text-accent-1 ml-1" href="/town">
          房間音樂庫
        </Link>
        會從這裡挑歌加入自己房間（Phase 7）。
      </p>

      <MoodTabs value={mood} onChange={setMood} />

      {user ? (
        <UploadForm onUploaded={handleUploaded} />
      ) : (
        <div className="text-[11px] text-muted border border-border rounded p-3">
          登入後即可上傳音樂。
        </div>
      )}

      {loading ? (
        <div className="text-xs text-muted py-4 text-center">載入中…</div>
      ) : error ? (
        <div className="text-[11px] text-red-400 border border-red-400/40 rounded px-2 py-1">
          載入失敗：{error}
        </div>
      ) : (
        <TrackList
          tracks={tracks}
          currentUserId={user?.id ?? null}
          onDeleted={handleDeleted}
          inPlaylist={inPlaylist}
          onAddToRoom={handleAddToRoom}
          onRemoveFromRoom={handleRemoveFromRoom}
        />
      )}
    </div>
  );
}
