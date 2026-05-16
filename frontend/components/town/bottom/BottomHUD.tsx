"use client";

import { FocusTimer } from "./FocusTimer";
import { MatchPanel } from "./MatchPanel";
import { MusicPlayer } from "./MusicPlayer";

interface BottomHUDProps {
  /** Triggered when "Find Buddy" is clicked. Town page lifts the
   *  modal-open state (parent of `BottomHUD` AND `<MatchModal>`). */
  onFindBuddy: () => void;
}

/**
 * Reference's bottom action band — 180 px tall, gradient backplate,
 * three pixel-panel children in a 1.05fr / 1fr / 1fr grid.
 *
 * - LEFT: `<FocusTimer>` (mode badge + PixelDigits + 5 controls)
 * - CENTER: `<MatchPanel>` (find buddy / solo focus)
 * - RIGHT: `<MusicPlayer>` (lofi · LIVE + EQViz + transport)
 *
 * On mobile (< md) the 3-cluster grid collapses to a single column
 * stack so the scene keeps room to breathe; on tablet+ it returns to
 * the reference's 3-col baseline.
 *
 * z-index 12 keeps it above the city silhouette but below modals.
 */
export function BottomHUD({ onFindBuddy }: BottomHUDProps) {
  return (
    <div
      data-testid="bottom-hud"
      className="md:grid md:grid-cols-[1.05fr_1fr_1fr] flex flex-col"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        height: 180,
        gap: 12,
        padding: 12,
        background:
          "linear-gradient(180deg, transparent 0%, rgba(7,4,26,0.92) 30%, rgba(7,4,26,1) 100%)",
        borderTop: "1px solid var(--panel-stroke)",
        zIndex: 12,
      }}
    >
      <FocusTimer />
      <MatchPanel onFindBuddy={onFindBuddy} />
      <MusicPlayer />
    </div>
  );
}
