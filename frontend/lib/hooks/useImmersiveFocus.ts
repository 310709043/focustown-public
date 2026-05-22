"use client";

import { useTimerStore } from "@/lib/state/timerStore";

/**
 * True from the moment the user hits Start until the session ends/pauses.
 * Drives the City-Mode immersive collapse: the BottomHUD slides down,
 * TopHUD's non-essential cluster slides up, and the centered countdown
 * fades in. Returning `running || starting` makes the collapse begin
 * during the brief async `sessionsApi.start()` round-trip, so the
 * transition feels instant — no perceptible click-to-collapse delay.
 */
export function useImmersiveFocus(): boolean {
  return useTimerStore((s) => s.running || s.starting);
}
