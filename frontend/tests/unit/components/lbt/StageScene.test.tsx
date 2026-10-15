/**
 * Stage scene preview: the street is the default and the switch stays
 * hidden; `?scene=pond` (the owner's preview link) shows the switch and
 * starts on the pond, and the switch toggles between the two.
 */
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { StageSceneToggle, useStageScene } from "@/components/lbt/StageScene";

afterEach(() => window.history.replaceState(null, "", "/"));

describe("useStageScene", () => {
  test("without a preview link: the street, and no switch", () => {
    const { result } = renderHook(() => useStageScene());
    expect([result.current.scene, result.current.enabled]).toEqual(["town", false]);
  });

  test("?scene=pond turns the switch on and starts on the pond", () => {
    window.history.replaceState(null, "", "/?scene=pond");
    const { result } = renderHook(() => useStageScene());
    expect([result.current.scene, result.current.enabled]).toEqual(["pond", true]);
    act(() => result.current.setScene("town"));
    expect(result.current.scene).toBe("town");
  });
});

describe("StageSceneToggle", () => {
  test("is a two-way radio group", () => {
    let picked = "";
    render(<StageSceneToggle scene="pond" setScene={(s) => { picked = s; }} />);
    expect(screen.getByRole("radio", { name: "lbt.pond.pond" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("radio", { name: "lbt.pond.town" }));
    expect(picked).toBe("town");
  });
});
