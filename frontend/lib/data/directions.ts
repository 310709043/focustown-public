/**
 * Map each scene to a "direction" (palette flavor) used by the
 * `:root[data-direction=...]` CSS blocks in globals.css. Scene stays
 * primary — direction is *derived*, not user-chosen — so we never
 * need to fork the SCENES table or add new stores.
 *
 * The three directions come from the reference prototype:
 *   neon  — purple/cyan/magenta (default, used for night/snow/storm)
 *   dusk  — orange sunset (dawn/day/dusk)
 *   rain  — teal/pink synthwave (rain only)
 */

import type { SceneName } from "@/lib/state/sceneStore";

export type Direction = "neon" | "dusk" | "rain";

export const SCENE_TO_DIRECTION: Record<SceneName, Direction> = {
  night: "neon",
  midnight: "neon",
  dawn: "dusk",
  day: "dusk",
  dusk: "dusk",
  cloudy: "dusk",
  rain: "rain",
  snow: "neon",
  storm: "neon",
};
