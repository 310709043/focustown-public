"use client";

import { useEffect, useRef } from "react";
import { ADSENSE_PUB_ID, isAdsEnabled } from "@/lib/config/ads";

interface AdSlotProps {
  /** AdSense ad-slot ID (from the dashboard). */
  slot: string;
  /** Ad format — "auto" lets AdSense pick, or use fixed formats. */
  format?: "auto" | "horizontal" | "rectangle" | "vertical";
  /** Whether to use responsive sizing (default true). */
  responsive?: boolean;
  /** Extra CSS class for the wrapper div. */
  className?: string;
  /** Optional test ID for e2e. */
  testId?: string;
}

/** Renders a single AdSense ad unit.
 *
 *  - Returns null when ads are disabled (no pub ID) or when the slot
 *    string is empty (placeholder not yet configured).
 *  - Calls `adsbygoogle.push({})` once after mount to initialise the
 *    unit — safe to call multiple times; AdSense deduplicates.
 *  - The wrapper carries `data-ad-status` so CSS can style
 *    filled / unfilled states if desired.
 */
export function AdSlot({
  slot,
  format = "auto",
  responsive = true,
  className,
  testId,
}: AdSlotProps) {
  const pushed = useRef(false);

  useEffect(() => {
    if (!isAdsEnabled() || !slot || pushed.current) return;
    try {
      ((window as unknown as Record<string, unknown>).adsbygoogle as unknown[] || []).push({});
      pushed.current = true;
    } catch {
      /* AdSense script not loaded yet or blocked — silent fail. */
    }
  }, [slot]);

  if (!isAdsEnabled() || !slot) return null;

  return (
    <div
      className={className}
      data-testid={testId}
      style={{ textAlign: "center", overflow: "hidden" }}
    >
      <ins
        className="adsbygoogle"
        style={{ display: "block" }}
        data-ad-client={ADSENSE_PUB_ID}
        data-ad-slot={slot}
        data-ad-format={format}
        data-full-width-responsive={responsive ? "true" : "false"}
      />
    </div>
  );
}
