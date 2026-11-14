"use client";

import { useEffect, useState } from "react";

/**
 * 下雨的小鎮 preview. Not on sale yet, so it is reachable only in a local
 * dev build with ?rain=1; production never shows it.
 */
export function useRainPreview(): boolean {
  const [rain, setRain] = useState(false);
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    setRain(new URLSearchParams(window.location.search).get("rain") === "1");
  }, []);
  return rain;
}

/** 小鎮風格 preview: dev builds only, ?theme=milktea|mint|sakura|pixel. */
const PREVIEW_THEMES = ["milktea", "mint", "sakura", "pixel"];
export function useThemePreview(): string | null {
  const [theme, setTheme] = useState<string | null>(null);
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const picked = new URLSearchParams(window.location.search).get("theme");
    if (picked && PREVIEW_THEMES.includes(picked)) {
      document.documentElement.dataset.lbtTheme = picked;
      setTheme(picked);
    }
  }, []);
  return theme;
}

/** The style pack in use (set on <html> by the preview), for views after the home. */
export function useActiveTheme(): string | null {
  const [theme, setTheme] = useState<string | null>(null);
  useEffect(() => {
    setTheme(document.documentElement.dataset.lbtTheme ?? null);
  }, []);
  return theme;
}
