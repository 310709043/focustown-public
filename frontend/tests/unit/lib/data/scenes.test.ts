/**
 * scene data integrity.
 *
 * Worth testing:
 * - Every name in SCENE_ORDER appears in SCENES (so cycling never hits a
 *   missing definition that would render a blank sky)
 * - Every SCENES entry has a label (used by the WeatherBadge)
 *
 * NOT worth testing:
 * - Exact gradient strings — they're design tokens; pinning them turns the
 *   test into a snapshot of preferred colors.
 */
import { expect, test } from "vitest";
import { SCENES } from "@/lib/data/scenes";
import { SCENE_ORDER } from "@/lib/state/sceneStore";

test("every SCENE_ORDER entry has a SCENES definition", () => {
  for (const name of SCENE_ORDER) {
    expect(SCENES[name]).toBeDefined();
  }
});

test("every SCENES entry has a non-empty label", () => {
  for (const def of Object.values(SCENES)) {
    expect(def.label).toBeTruthy();
  }
});
