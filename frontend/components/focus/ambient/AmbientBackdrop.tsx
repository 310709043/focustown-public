"use client";

import { RainOverlay } from "@/components/pixel/RainOverlay";
import { StarField } from "@/components/pixel/StarField";
import type { FocusBgId } from "@/lib/data/focusBackgrounds";

import { CafeAmbient } from "./CafeAmbient";
import { FireAmbient } from "./FireAmbient";
import { ForestAmbient } from "./ForestAmbient";
import { LofiAmbient } from "./LofiAmbient";

/**
 * Routes the current ambient id to the right effect renderer. Reused
 * from the right-column `AmbientPanel` picker. `space` and `rain`
 * delegate to pre-existing primitives (`StarField`, `RainOverlay`)
 * so we don't duplicate canvas logic.
 */
export function AmbientBackdrop({ bg }: { bg: FocusBgId }) {
  switch (bg) {
    case "cafe":
      return <CafeAmbient />;
    case "rain":
      return <RainOverlay color="#67e8f9" density={1.2} />;
    case "forest":
      return <ForestAmbient />;
    case "space":
      return (
        <div
          aria-hidden
          data-testid="ambient-space"
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
          }}
        >
          <StarField density={0.0015} />
        </div>
      );
    case "lofi":
      return <LofiAmbient />;
    case "fire":
      return <FireAmbient />;
    default:
      return null;
  }
}
