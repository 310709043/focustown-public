"use client";

import { useEffect, useState } from "react";

/**
 * Subscribes to the OS-level `prefers-reduced-motion: reduce` setting.
 *
 * City-Mode immersive uses sizeable translateY / translateX transforms
 * (HUDs slide 100% off-screen, MatchPanel cards split outward). Users
 * who have opted out of motion should get an instant state swap rather
 * than the 400ms cubic-bezier journey. Components feed the returned
 * boolean into their `transition` string — empty string = no animation,
 * the new transform is applied immediately.
 *
 * SSR returns `false` (no media-query access on the server); the first
 * client effect aligns to the actual preference before paint.
 */
export function usePrefersReducedMotion(): boolean {
  const [prefers, setPrefers] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefers(mq.matches);
    const handler = (event: MediaQueryListEvent) => setPrefers(event.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return prefers;
}
