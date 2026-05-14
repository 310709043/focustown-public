"use client";

import { useEffect } from "react";

import { SCENE_TO_DIRECTION } from "@/lib/data/directions";
import { useSceneStore } from "@/lib/state/sceneStore";

/**
 * Writes `<html data-direction>` whenever the scene changes. Mounted
 * once at the root layout so every route picks up the same direction
 * without each page having to opt in. Renders nothing.
 *
 * SSR note: the effect runs on mount, so on first paint the document
 * has no `data-direction` attribute — that's fine, the `:root` block
 * in globals.css uses the un-attribute selector as the neon default.
 */
export function DirectionSync() {
  const current = useSceneStore((s) => s.current);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.direction = SCENE_TO_DIRECTION[current];
  }, [current]);

  return null;
}
