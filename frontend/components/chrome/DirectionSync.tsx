"use client";

import { useEffect } from "react";

import { SCENE_TO_DIRECTION } from "@/lib/data/directions";
import { useSceneStore } from "@/lib/state/sceneStore";

/**
 * Writes `<html data-direction>` whenever the scene changes, and
 * mirrors the active route locale onto `<html lang>` so SEO crawlers
 * and screen readers see the language the user is actually reading.
 *
 * Lives at the locale layout (one instance per request). The root
 * layout pins a default `lang="zh-TW"` so SSR markup is valid; this
 * effect updates it on hydration when the route is `en/*`.
 */
export function DirectionSync({ locale }: { locale?: string } = {}) {
  const current = useSceneStore((s) => s.current);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.direction = SCENE_TO_DIRECTION[current];
  }, [current]);

  useEffect(() => {
    if (typeof document === "undefined" || !locale) return;
    document.documentElement.lang = locale;
  }, [locale]);

  return null;
}
