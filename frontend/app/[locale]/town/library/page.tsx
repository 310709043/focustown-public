"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { useRouter } from "@/i18n/routing";
import { ApiError } from "@/lib/api/client";
import { roomTracksApi, tracksApi } from "@/lib/api/endpoints";
import type { Track } from "@/lib/api/types.gen";
import { useAuthStore } from "@/lib/state/authStore";
import { BlinkDot } from "@/components/pixel/BlinkDot";
import { MoodTabs, type MoodKey } from "@/components/library/MoodTabs";
import { TrackList } from "@/components/library/TrackList";

export default function LibraryPage() {
  const router = useRouter();
  const { user, hydrate } = useAuthStore();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [mood, setMood] = useState<MoodKey>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inPlaylist, setInPlaylist] = useState<Set<string>>(() => new Set());
  const t = useTranslations("library.page");

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
    <div
      data-testid="library-page"
      className="mx-auto max-w-2xl px-4 py-6"
      style={{ display: "flex", flexDirection: "column", gap: 16 }}
    >
      <header
        className="pixel-panel"
        style={{
          padding: "12px 14px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span
            className="font-silkscreen"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              fontSize: 9,
              color: "var(--ink-dim)",
              letterSpacing: "0.2em",
            }}
          >
            <BlinkDot color="var(--accent-3)" />
            {t("breadcrumb")}
          </span>
          <h1
            className="font-silkscreen"
            style={{
              fontSize: 14,
              color: "var(--accent)",
              letterSpacing: "0.15em",
              margin: 0,
            }}
          >
            {t("title")}
          </h1>
        </div>
        <button
          type="button"
          onClick={() => router.push("/town")}
          className="pixel-btn"
          style={{ padding: "6px 12px", fontSize: 10 }}
        >
          ◀ {t("backCta")}
        </button>
      </header>

      <p
        style={{
          fontSize: 11,
          color: "var(--ink-mute)",
          lineHeight: 1.7,
          margin: 0,
        }}
      >
        {t("intro")}
      </p>

      <MoodTabs value={mood} onChange={setMood} />

      {!user && (
        <div
          className="pixel-panel"
          style={{
            padding: 12,
            fontSize: 11,
            color: "var(--ink-mute)",
          }}
        >
          {t("signedOutHint")}
        </div>
      )}

      {loading ? (
        <div
          className="font-silkscreen"
          style={{
            fontSize: 10,
            color: "var(--ink-mute)",
            padding: 16,
            textAlign: "center",
            letterSpacing: "0.15em",
          }}
        >
          {t("loading")}
        </div>
      ) : error ? (
        <div
          role="alert"
          className="pixel-panel"
          style={{
            padding: "8px 12px",
            fontSize: 11,
            color: "var(--coral)",
            borderColor: "var(--coral)",
          }}
        >
          {t("loadFailedPrefix")}
          {error}
        </div>
      ) : (
        <TrackList
          tracks={tracks}
          canCurateRoom={user !== null}
          inPlaylist={inPlaylist}
          onAddToRoom={handleAddToRoom}
          onRemoveFromRoom={handleRemoveFromRoom}
        />
      )}
    </div>
  );
}
