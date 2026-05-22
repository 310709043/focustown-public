"use client";

import { useImmersiveFocus } from "@/lib/hooks/useImmersiveFocus";
import { usePrefersReducedMotion } from "@/lib/hooks/usePrefersReducedMotion";

import { FocusTimer } from "./FocusTimer";
import { MatchPanel } from "./MatchPanel";
import { ModeStatusBar } from "./ModeStatusBar";
import { MusicPlayer } from "./MusicPlayer";

interface BottomHUDProps {
  /** Triggered when "Find Buddy" is clicked. Town page lifts the
   *  modal-open state (parent of `BottomHUD` AND `<MatchModal>`). */
  onFindBuddy: () => void;
  /** City-Mode immersive: parent owns the edge-reveal state machine
   *  (shared with the bottom-edge sentinel in /town). When true, the
   *  HUD slides back in even while the timer is running. */
  edgeRevealed?: boolean;
  onEdgeEnter?: () => void;
  onEdgeLeave?: () => void;
}

/**
 * Reference's bottom action band — 168 px tall, gradient backplate,
 * three pixel-panel children in a 1.05fr / 1fr / 1fr grid, plus a 36 px
 * Mode Status Bar pinned above it that names the current City Mode and
 * exposes shortcuts to Solo / Together.
 *
 * - STATUS BAR (above, 36 px): `<ModeStatusBar>` — CITY MODE · LIVE · N
 * - LEFT: `<FocusTimer>` (mode badge + PixelDigits + 5 controls)
 * - CENTER: `<MatchPanel>` (Solo + Together mode cards)
 * - RIGHT: `<MusicPlayer>` (lofi · LIVE + EQViz + transport)
 *
 * On mobile (< md) the status bar hides itself (handled inside the bar
 * via Tailwind responsive classes) and the 3-cluster grid collapses to
 * a single column stack so the scene keeps room to breathe.
 *
 * z-index 12 keeps both surfaces above the city silhouette but below
 * modals.
 */
export function BottomHUD({
  onFindBuddy,
  edgeRevealed = false,
  onEdgeEnter,
  onEdgeLeave,
}: BottomHUDProps) {
  const immersive = useImmersiveFocus();
  const reduceMotion = usePrefersReducedMotion();
  const collapsed = immersive && !edgeRevealed;
  return (
    <>
      <ModeStatusBar
        onFindBuddy={onFindBuddy}
        collapsed={collapsed}
        reduceMotion={reduceMotion}
      />
      <div
        data-testid="bottom-hud"
        onPointerEnter={immersive ? onEdgeEnter : undefined}
        onPointerLeave={immersive ? onEdgeLeave : undefined}
        // `.bottom-hud-root` owns full-bleed position + gradient
        // background. The inner `.bottom-hud-inner` div owns the
        // three-column grid + `--app-content-max-width` cap that
        // keeps panels grouped on ≥ 2880 px screens (4K / 5K / TV).
        // Common monitors (≤ 2560 px) fall through the `none` default
        // and render exactly as before. Container queries (not viewport
        // `md:`) so this stays correct even if a future layout drops
        // the HUD inside a narrower slot.
        className="bottom-hud-root"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          background: collapsed
            ? "linear-gradient(180deg, transparent 0%, transparent 100%)"
            : "linear-gradient(180deg, transparent 0%, rgba(7,4,26,0.92) 30%, rgba(7,4,26,1) 100%)",
          borderTop: collapsed
            ? "1px solid transparent"
            : "1px solid var(--panel-stroke)",
          zIndex: 12,
          transition: reduceMotion
            ? "none"
            : "transform 420ms cubic-bezier(0.22,1,0.36,1), opacity 320ms ease-out, background 320ms ease-out, border-top-color 320ms ease-out",
          transform: collapsed ? "translateY(100%)" : "translateY(0)",
          opacity: collapsed ? 0 : 1,
          pointerEvents: collapsed ? "none" : "auto",
        }}
      >
        <div className="bottom-hud-inner">
          <FocusTimer />
          <MatchPanel onFindBuddy={onFindBuddy} />
          <MusicPlayer />
        </div>
      </div>
    </>
  );
}
