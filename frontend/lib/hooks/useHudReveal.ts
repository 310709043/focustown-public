"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Edge-hover reveal for the City-Mode immersive focus screen.
 *
 * Returns two flags + matching pointer handlers. Wire `topHandlers` to
 * a fixed-position transparent strip pinned to the top of the viewport
 * (and the same for `bottomHandlers` at the bottom). When the pointer
 * enters either sentinel — OR the HUD itself — the flag flips true,
 * letting the HUD slide back in. Leaving the sentinel + the HUD region
 * starts a grace timer (default 600ms) before collapsing again, so the
 * user can move the cursor through the gap without flicker.
 */
const COLLAPSE_GRACE_MS = 600;

interface RevealHandlers {
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}

interface UseHudRevealResult {
  topRevealed: boolean;
  bottomRevealed: boolean;
  topHandlers: RevealHandlers;
  bottomHandlers: RevealHandlers;
}

function useEdgeReveal(): [boolean, RevealHandlers] {
  const [revealed, setRevealed] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPending = useCallback(() => {
    if (timeoutRef.current != null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  useEffect(() => clearPending, [clearPending]);

  const onPointerEnter = useCallback(() => {
    clearPending();
    setRevealed(true);
  }, [clearPending]);

  const onPointerLeave = useCallback(() => {
    clearPending();
    timeoutRef.current = setTimeout(() => {
      setRevealed(false);
      timeoutRef.current = null;
    }, COLLAPSE_GRACE_MS);
  }, [clearPending]);

  return [revealed, { onPointerEnter, onPointerLeave }];
}

export function useHudReveal(): UseHudRevealResult {
  const [topRevealed, topHandlers] = useEdgeReveal();
  const [bottomRevealed, bottomHandlers] = useEdgeReveal();
  return { topRevealed, bottomRevealed, topHandlers, bottomHandlers };
}
