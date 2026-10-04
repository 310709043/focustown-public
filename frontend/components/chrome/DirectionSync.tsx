"use client";

import { useEffect } from "react";

import { SCENE_TO_DIRECTION } from "@/lib/data/directions";
import { useSceneStore } from "@/lib/state/sceneStore";

/**
 * Writes `<html data-direction>` whenever the scene changes, and keeps
 * `<html lang>` on the route locale across client-side navigation between
 * locales (the server HTML already carries it from `[locale]/layout.tsx`).
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
