"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

/**
 * Single global ticker that emits a monotonically-increasing frame counter
 * at a base rate. Every `<AnimatedSprite>` mounted under the provider reads
 * the same counter and derives its own frame index from it.
 *
 * Why: each `<AnimatedSprite>` previously owned its own `setInterval`. With
 * 12 walkers + 12 cars + a cat = 25 timers, each waking the main thread on
 * a slightly different schedule. One shared ticker has the same visible
 * result with O(1) timer cost.
 *
 * Base rate is 5fps (200ms). Sprites that want a slower fps (e.g. walkers
 * at 3fps) derive their index from `floor(frame * sprite_fps / base_fps)`
 * and mod into `frames.length`.
 *
 * `<FrameTicker>` mounts around scenes that contain many sprites (e.g.
 * `/town`). Solo `<AnimatedSprite>` instances (the dev sprite gallery)
 * still work — the component falls back to its own interval when the
 * context returns `null`.
 */

export const BASE_FPS = 5;
const TICK_MS = 1000 / BASE_FPS;

// `null` means "no provider mounted; consumer should fall back to local".
const FrameTickerContext = createContext<number | null>(null);

export function FrameTicker({ children }: { children: ReactNode }) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      // Unsigned wrap so the counter never overflows over a long session.
      setFrame((f) => (f + 1) >>> 0);
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  return (
    <FrameTickerContext.Provider value={frame}>
      {children}
    </FrameTickerContext.Provider>
  );
}

/**
 * Returns the current shared frame counter, or `null` if the consumer is
 * not under a `<FrameTicker>` provider. Callers that need to keep working
 * standalone should treat `null` as "no shared ticker, run my own".
 */
export function useFrameTick(): number | null {
  return useContext(FrameTickerContext);
}
