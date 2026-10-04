"use client";

import { useTranslations } from "next-intl";
import { useEffect, type KeyboardEvent } from "react";

import type { MusicLevel } from "@/lib/lbt/music";
import { useMusicStore } from "@/lib/lbt/musicStore";

const LEVELS: readonly MusicLevel[] = [0, 1, 2];

/** Reads the saved volume step and pauses when the tab is hidden. */
export function useMusicLifecycle() {
  useEffect(() => {
    useMusicStore.getState().hydrate();
    const onVisibility = () => {
      if (document.hidden) useMusicStore.getState().pause();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);
}

/**
 * Sits in the battery card's top line: a hint until the first play, then
 * three signal bars (the town's own ▂▄▆) for quiet / medium / loud.
 */
export function MusicVolume() {
  const t = useTranslations("lbt.music");
  const seen = useMusicStore((s) => s.seen);
  const level = useMusicStore((s) => s.level);
  const toggle = useMusicStore((s) => s.toggle);
  const setLevel = useMusicStore((s) => s.setLevel);

  if (!seen) {
    return (
      <button
        type="button"
        className="music-hint"
        onClick={() => void toggle()}
      >
        <span aria-hidden="true">♪</span> {t("hint")}
      </button>
    );
  }

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowUp"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowDown"
          ? -1
          : 0;
    if (!step) return;
    event.preventDefault();
    const next = Math.max(0, Math.min(2, level + step)) as MusicLevel;
    setLevel(next);
    const group = event.currentTarget.parentElement;
    group?.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
  };

  return (
    <span className="music-volume-wrap">
      <span className="music-volume-icon" aria-hidden="true">
        ♪
      </span>
      <div className="music-volume" role="radiogroup" aria-label={t("volume")}>
        {LEVELS.map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={level === value}
            aria-label={t(`levels.${value}`)}
            tabIndex={level === value ? 0 : -1}
            className={value <= level ? "on" : undefined}
            onClick={() => setLevel(value)}
            onKeyDown={onKeyDown}
          >
            <span />
          </button>
        ))}
      </div>
    </span>
  );
}

/** The header's small music switch: always on desktop, on phones once music has been started. */
export function HeaderMusicButton() {
  const t = useTranslations("lbt.music");
  const playing = useMusicStore((s) => s.playing);
  const started = useMusicStore((s) => s.started);
  const toggle = useMusicStore((s) => s.toggle);
  return (
    <button
      type="button"
      className={`music-pill${started ? " is-started" : ""}`}
      aria-pressed={playing}
      aria-label={playing ? t("pause") : t("play")}
      title={playing ? t("pause") : t("play")}
      onClick={() => void toggle()}
    >
      <span className="music-eq" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
    </button>
  );
}
