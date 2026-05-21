"use client";

import { useEffect, useState } from "react";

interface SpotlightOverlayProps {
  /** CSS selector for the target element to "cut a hole" around.
   *  If null, the overlay dims the whole screen with no hole — used
   *  for the welcome and done steps that don't point at anything. */
  targetSelector: string | null;
  /** Extra padding around the target rect, in px. */
  padding?: number;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * Full-screen dim overlay with an animated dashed border around the
 * target element (no hard "cut out" — the target stays visible and the
 * dashed marquee tells the user where to look without flickering when
 * scrolling or resizing).
 *
 * The overlay itself is `pointer-events: none` so it never blocks
 * interaction; the dashed ring is decoration only. The CoachBubble
 * sibling is what catches Next / Back / Skip.
 */
export function SpotlightOverlay({
  targetSelector,
  padding = 8,
}: SpotlightOverlayProps) {
  const [rect, setRect] = useState<Rect | null>(null);

  useEffect(() => {
    if (!targetSelector) {
      setRect(null);
      return;
    }

    const measure = () => {
      const el = document.querySelector(targetSelector);
      if (!el) {
        setRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      setRect({
        top: r.top - padding,
        left: r.left - padding,
        width: r.width + padding * 2,
        height: r.height + padding * 2,
      });
    };

    measure();
    const ro = new ResizeObserver(measure);
    const target = document.querySelector(targetSelector);
    if (target) ro.observe(target);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    // Re-measure on the next frame so layout changes from the bubble
    // appearing don't leave a stale ring.
    const raf = requestAnimationFrame(measure);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      cancelAnimationFrame(raf);
    };
  }, [targetSelector, padding]);

  return (
    <div
      data-testid="onboarding-overlay"
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(1, 0, 10, 0.72)",
        pointerEvents: "none",
        zIndex: 60,
      }}
    >
      {rect ? (
        <div
          data-testid="onboarding-spotlight-ring"
          style={{
            position: "fixed",
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            border: "2px dashed var(--accent)",
            boxShadow:
              "0 0 0 2px rgba(233,167,110,0.25), 0 0 24px rgba(233,167,110,0.45)",
            pointerEvents: "none",
            transition: "top 200ms ease, left 200ms ease, width 200ms ease, height 200ms ease",
          }}
        />
      ) : null}
    </div>
  );
}
