"use client";

import { useEffect, useRef } from "react";

import { buildBug, buildRig, drawBug, drawRig } from "@/lib/lbt/streetCat/rig";
import { createSim, GROUND_Y, lighting, lookAtViewer, stepSim, type CatWorld } from "@/lib/lbt/streetCat/sim";
import { TOWN_TIMES, TOWN_WEEKS, type TownTime, type TownWeek } from "@/lib/lbt/townTime";

/** Same drawing space as the street (Townscape), so the cat walks on its ground. */
const VIEWBOX = "0 -110 1200 310";

function readWorld(root: HTMLElement, motion: MediaQueryList | null): CatWorld {
  const time = root.getAttribute("data-lbt-time");
  const week = root.getAttribute("data-lbt-week");
  return {
    time: (TOWN_TIMES as readonly string[]).includes(time ?? "") ? (time as TownTime) : "night",
    week: (TOWN_WEEKS as readonly string[]).includes(week ?? "") ? (week as TownWeek) : "weekday",
    reduced: motion?.matches ?? false,
  };
}

/**
 * A small calico living on the home street (lib/lbt/streetCat): it walks,
 * stops to sit, groom, stretch or chase a butterfly, and keeps to lamp 07's
 * light after dark. Click it and it turns to look at you. Decorative: the
 * street around it is aria-hidden and only the cat itself takes clicks.
 *
 * It only runs while the street is on screen (street scene, any size), stops
 * with the tab, and under reduced motion just sits and blinks. The server
 * renders an empty layer; the cat is built in the browser.
 */
export function StreetCat() {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = ref.current;
    if (!svg || typeof IntersectionObserver === "undefined") return;
    const root = document.documentElement;
    const motion = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    const sim = createSim();
    const rig = buildRig(svg, "lbt-cat");
    const bug = buildBug(svg);
    let frameId = 0;
    let last = 0;

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const world = readWorld(root, motion);
      const pose = stepSim(sim, world, dt);
      drawRig(rig, pose, sim, lighting(sim, world), sim.x, GROUND_Y);
      drawBug(bug, sim, world.time, GROUND_Y);
      frameId = requestAnimationFrame(frame);
    };
    const run = (on: boolean) => {
      if (on && !frameId) {
        last = performance.now();
        frameId = requestAnimationFrame(frame);
      } else if (!on && frameId) {
        cancelAnimationFrame(frameId);
        frameId = 0;
      }
    };
    const seen = new IntersectionObserver((entries) => run(entries.some((e) => e.isIntersecting)));
    seen.observe(svg);
    const onClick = () => lookAtViewer(sim);
    rig.hit.addEventListener("click", onClick);

    return () => {
      seen.disconnect();
      run(false);
      rig.hit.removeEventListener("click", onClick);
      svg.replaceChildren();
    };
  }, []);

  return (
    <svg
      ref={ref}
      className="tw-street tw-cat-layer"
      viewBox={VIEWBOX}
      preserveAspectRatio="xMidYMax slice"
      focusable="false"
    />
  );
}
