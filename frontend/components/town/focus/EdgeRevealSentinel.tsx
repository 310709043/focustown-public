"use client";

interface EdgeRevealSentinelProps {
  /** Which viewport edge this sentinel hugs. `"top"` pins to top:0,
   *  `"bottom"` pins to bottom:0. Height is fixed at 24 px — large
   *  enough to be a comfortable hover target, small enough that
   *  cursor-near-edge gestures don't accidentally trigger it. */
  edge: "top" | "bottom";
  /** Test id surfaced to data-testid for E2E hooks. */
  testId: string;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}

/**
 * Invisible 24 px strip pinned to the viewport top or bottom edge.
 *
 * Only mounts while City-Mode immersive focus is active (the parent
 * /town page gates that). Hovering the strip lets the user summon the
 * collapsed `TownTopHUD` / `BottomHUD` back briefly without exiting the
 * focus session. Sits at `z-index: 11` so it sits *under* the HUDs
 * (top z-20, bottom z-12) when they're visible — it only becomes the
 * effective hover target once the HUD has slid out of frame.
 *
 * SRP: this component renders one transparent rectangle and wires two
 * pointer handlers. The state machine (revealed flag, grace timer)
 * lives in `useHudReveal`; the decision to mount / unmount lives in
 * the /town page.
 */
export function EdgeRevealSentinel({
  edge,
  testId,
  onPointerEnter,
  onPointerLeave,
}: EdgeRevealSentinelProps) {
  return (
    <div
      data-testid={testId}
      aria-hidden
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        height: 24,
        zIndex: 11,
        background: "transparent",
        ...(edge === "top" ? { top: 0 } : { bottom: 0 }),
      }}
    />
  );
}
