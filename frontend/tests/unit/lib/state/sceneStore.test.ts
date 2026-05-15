/**
 * sceneStore — scene cycling.
 *
 * Worth testing:
 * - advance() walks through SCENE_ORDER, wrapping at the end
 * - setScene() updates current without touching orderIdx (manual override)
 *
 * NOT worth testing:
 * - The literal SCENES record contents — that's data; verified by
 *   data/scenes.test.ts elsewhere.
 */
import { beforeEach, describe, expect, test } from "vitest";
import { SCENE_ORDER, useSceneStore } from "@/lib/state/sceneStore";

beforeEach(() => {
  useSceneStore.setState({ current: "night", orderIdx: 0 });
});

test("advance cycles to the next scene in SCENE_ORDER", () => {
  useSceneStore.getState().advance();
  expect(useSceneStore.getState().current).toBe(SCENE_ORDER[1]);
});

test("advance wraps back to the first scene after the last index", () => {
  useSceneStore.setState({ orderIdx: SCENE_ORDER.length - 1 });
  useSceneStore.getState().advance();
  expect(useSceneStore.getState().orderIdx).toBe(0);
  expect(useSceneStore.getState().current).toBe(SCENE_ORDER[0]);
});

test("setScene replaces current without touching orderIdx", () => {
  useSceneStore.setState({ orderIdx: 3 });
  useSceneStore.getState().setScene("storm");
  expect(useSceneStore.getState().current).toBe("storm");
  expect(useSceneStore.getState().orderIdx).toBe(3);
});
