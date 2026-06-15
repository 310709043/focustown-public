"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";

import { ConnectedShared } from "@/components/audio/ConnectedShared";
import { DisconnectedPersonal } from "@/components/audio/DisconnectedPersonal";
import { PixelSprite } from "@/components/pixel/PixelSprite";
import { NOTE } from "@/lib/pixel/sprites/props";
import {
  personalRadioApi,
  type PersonalPlaylistTrack,
} from "@/lib/api/endpoints";
import {
  selectCurrentTrack,
  useAudioStore,
} from "@/lib/state/audioStore";
import { usePresenceStore } from "@/lib/state/presenceStore";
import {
  selectActiveConnection,
  useStationStore,
} from "@/lib/state/stationStore";

import { EQViz } from "./EQViz";

/**
 * Bottom-HUD right cluster — reference-aligned music UI for /town.
 *
 * Owns the city radio's `<audio>` element via the shared
 * `useRadioPlaylist` hook (also consumed by `<PersonalRadio>` on
 * /focus/[id] and /town/room/[id]). DIP: depends on the hook, not on
 * direct `personalRadioApi` / `<audio>` plumbing.
 *
 * The 5 genre tabs + standalone unlock CTA were dropped 2026-05-20 —
 * the tabs didn't filter anything (no backend genre routing) and the
 * unlock CTA is now folded into the play button (first ▶ click both
 * satisfies browser autoplay policy and starts playback).
 */
export function MusicPlayer() {
  const t = useTranslations("town.bottom.musicPlayer");
  // Pure controller — every state lives in the global audio store, the
  // single <audio> element lives in <GlobalAudioMount/> in the locale
  // layout. We never touch the DOM here.
  const tracks = useAudioStore((s) => s.tracks);
  const index = useAudioStore((s) => s.index);
  const currentTrack = useAudioStore(selectCurrentTrack);
  const isPlaying = useAudioStore((s) => s.isPlaying);
  const muted = useAudioStore((s) => s.muted);
  const audioUnlocked = useAudioStore((s) => s.audioUnlocked);
  const setContext = useAudioStore((s) => s.setContext);
  const toggleMute = useAudioStore((s) => s.toggleMute);
  const unlock = useAudioStore((s) => s.unlock);
  const next = useAudioStore((s) => s.next);

  const stationCity = useStationStore((s) => s.city);
  const hydrateCity = useStationStore((s) => s.hydrateCity);
  const stationConnection = useStationStore(selectActiveConnection);
  const setPersonalPlaylist = useStationStore((s) => s.setPersonalPlaylist);
  const personalPlaylistLen = useStationStore(
    (s) => s.personalPlaylist.length,
  );
  // "N listening" — reuse street presence count for city scope (cheap;
  // dedicated SCARD on station channel would need new infra).
  const listenerCount = usePresenceStore(
    (s) => Math.max(Object.keys(s.byId).length, 1),
  );

  // Adopt the "city" radio context on mount. Idempotent in the store —
  // navigating back to /town after visiting /focus keeps the same
  // playlist (no refetch, no playback restart).
  useEffect(() => {
    void setContext("city", "city");
  }, [setContext]);

  // Tune into the city station on mount. Frontend hydrateCity swallows
  // the 404 when the backend flag is off, so this is safe even before
  // the worker has shipped. `activeScope` is set at the town-page level
  // (page.tsx) so ModeStatusBar sees the correct scope on first paint.
  useEffect(() => {
    if (!stationCity) {
      void hydrateCity();
    }
  }, [hydrateCity, stationCity]);

  // Seed the personal fallback playlist used by the disconnected view.
  // Loaded lazily — only fetch when the user has stepped out at least
  // once. The first ``disconnect()`` triggers this effect through the
  // length-changed dep.
  useEffect(() => {
    if (stationConnection !== "disconnected" || personalPlaylistLen > 0) return;
    void personalRadioApi
      .getPlaylist({ context: "city", contextId: "personal" })
      .then((res: { tracks: PersonalPlaylistTrack[] }) => {
        setPersonalPlaylist(res.tracks);
      })
      .catch(() => {
        // Empty playlist — disconnect view shows "playlist empty"
      });
  }, [stationConnection, personalPlaylistLen, setPersonalPlaylist]);

  if (stationCity) {
    if (stationConnection === "connected") {
      return (
        <ConnectedShared scopeKind="city" listenerCount={listenerCount} />
      );
    }
    return <DisconnectedPersonal scopeKind="city" />;
  }
  // Feature flag off OR station not yet hydrated → fall back to the
  // legacy per-user player so /town never goes silent.

  // First click both unlocks audio (browser autoplay policy needs the
  // play() call inside a user gesture) and toggles mute. There is no
  // play/pause anywhere in the app — the only "silence it" affordance
  // is mute (see feedback-no-music-pause).
  const onMuteClick = async () => {
    if (!audioUnlocked) await unlock();
    toggleMute();
  };

  return (
    <div
      data-testid="music-player"
      className="pixel-panel hud-panel"
    >
      {/* Header row */}
      <div className="hud-panel-header">
        <div
          className="font-silkscreen"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 11,
            color: "var(--accent-3)",
            letterSpacing: "0.18em",
          }}
        >
          <PixelSprite sprite={NOTE.sprite} palette={NOTE.palette} scale={1.4} />
          <span>{t("liveLabel")}</span>
        </div>
        <EQViz playing={isPlaying} />
      </div>

      {/* Track info */}
      <div className="font-silkscreen" style={{ fontSize: 12, color: "var(--ink)" }}>
        {currentTrack ? currentTrack.title : t("trackTitleFallback")}
      </div>
      <div
        className="font-silkscreen"
        style={{ fontSize: 10, color: "var(--ink-mute)", letterSpacing: "0.1em" }}
      >
        {t("trackSubLine", {
          index: tracks.length > 0 ? index + 1 : 1,
          total: tracks.length > 0 ? tracks.length : 5,
        })}
      </div>

      {/* Controls */}
      <div className="hud-panel-controls">
        <button
          type="button"
          aria-label={muted ? t("unmuteAria") : t("muteAria")}
          data-testid="music-mute"
          className="pixel-btn primary touch:min-h-[44px]"
          style={{ flex: 1, padding: "6px 10px", fontSize: 11 }}
          onClick={onMuteClick}
        >
          {muted ? "🔇" : "🔊"}
        </button>
        <button
          type="button"
          aria-label={t("nextAria")}
          data-testid="music-next"
          className="pixel-btn touch:min-h-[44px]"
          style={{ padding: "6px 10px", fontSize: 11 }}
          onClick={next}
        >
          ▶▶
        </button>
      </div>
    </div>
  );
}
