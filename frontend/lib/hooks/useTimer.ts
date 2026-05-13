"use client";

import { useEffect } from "react";
import { useTimerStore } from "../state/timerStore";

/**
 * Drives the timerStore tick on a 1-second interval while running.
 * Use in a top-level layout/page component so the timer keeps ticking
 * regardless of which panel is mounted.
 */
export function useTimer() {
  const running = useTimerStore((s) => s.running);
  const tick = useTimerStore((s) => s.tick);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [running, tick]);
}
