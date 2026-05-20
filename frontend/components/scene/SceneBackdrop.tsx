"use client";

import { useEffect, useRef, useState } from "react";

import { SCENE_BACKDROPS, type BackdropSpec } from "@/lib/data/sceneBackdrops";
import { useSceneStore, type SceneName } from "@/lib/state/sceneStore";

import { DriftCloud } from "./DriftCloud";

/**
 * Full-stage backdrop for /town — replaces the previous Sky + StarsLayer +
 * CelestialBody + CityBackground + Clouds stack. Each scene picks one
 * 322807 city composite (sky + buildings baked in) and 1–2 small 801184
 * cloud sprites; three night scenes layer a 281031 moon-stars overlay via
 * screen-blend.
 *
 * Scene transitions render the outgoing layer for 6 s while the incoming
 * layer fades in over the same window — the CSS keyframes
 * `sceneBackdropFadeIn` / `sceneBackdropFadeOut` (in app/globals.css) do
 * the work; this component just manages which layers are mounted.
 *
 * Honors `prefers-reduced-motion` indirectly: the cloud drift loop in
 * `DriftCloud` exits early under reduce-motion, and the fade keyframes
 * still run (a 6 s opacity fade is well within the WCAG comfort window —
 * no flashes, no parallax, no animated content beyond a gentle alpha).
 */

const CROSS_FADE_MS = 6000;

export function SceneBackdrop() {
  const current = useSceneStore((s) => s.current);

  // Track an outgoing "fading" scene that cross-fades with the new current
  // for `CROSS_FADE_MS`. The first render uses `mode: "static"` so the
  // initial paint isn't a fade-from-black.
  const [fading, setFading] = useState<SceneName | null>(null);
  const [hasMounted, setHasMounted] = useState(false);
  const lastCurrentRef = useRef<SceneName>(current);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    if (lastCurrentRef.current === current) return;
    setFading(lastCurrentRef.current);
    lastCurrentRef.current = current;
    const t = window.setTimeout(() => setFading(null), CROSS_FADE_MS + 200);
    return () => window.clearTimeout(t);
  }, [current]);

  return (
    <div
      data-testid="scene-backdrop"
      aria-hidden
      className="absolute inset-0 overflow-hidden"
      style={{ zIndex: 0 }}
    >
      {fading ? (
        <SceneLayer
          key={`fade-${fading}`}
          scene={fading}
          spec={SCENE_BACKDROPS[fading]}
          mode="out"
        />
      ) : null}
      <SceneLayer
        key={`cur-${current}`}
        scene={current}
        spec={SCENE_BACKDROPS[current]}
        mode={hasMounted ? "in" : "static"}
      />
    </div>
  );
}

function SceneLayer({
  scene,
  spec,
  mode,
}: {
  scene: SceneName;
  spec: BackdropSpec;
  mode: "static" | "in" | "out";
}) {
  const animClass =
    mode === "in"
      ? "scene-backdrop-fade-in"
      : mode === "out"
        ? "scene-backdrop-fade-out"
        : "";
  return (
    <div
      data-testid={`scene-backdrop-layer-${scene}`}
      className={`absolute inset-0 ${animClass}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={spec.cityPng}
        alt=""
        className="scene-backdrop-city"
      />
      {spec.skyOverlay ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={spec.skyOverlay.src}
          alt=""
          className="scene-backdrop-sky"
          style={{ opacity: spec.skyOverlay.opacity }}
        />
      ) : null}
      {spec.clouds.map((c, i) => (
        <DriftCloud key={`${scene}-cloud-${i}`} spec={c} />
      ))}
    </div>
  );
}
