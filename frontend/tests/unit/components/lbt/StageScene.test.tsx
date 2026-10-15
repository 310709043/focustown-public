/**
 * The koi pond is a paid extra: without an unlock the stage stays on the
 * street and the switch is hidden (no free preview link); a device that
 * redeemed a code gets the switch and keeps its last choice.
 */
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { StageSceneOffer, StageSceneToggle, useStageScene } from "@/components/lbt/StageScene";
import { useUnlocks } from "@/lib/lbt/unlocks";

vi.mock("@/i18n/routing", () => ({
  Link: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a>,
}));

beforeEach(() => {
  window.localStorage.clear();
  useUnlocks.setState({ items: [], loaded: true });
});
afterEach(() => window.history.replaceState(null, "", "/"));

describe("useStageScene", () => {
  test("without an unlock: the street, no switch, and ?scene=pond does nothing", () => {
    window.history.replaceState(null, "", "/?scene=pond");
    window.localStorage.setItem("lbt-stage-scene", "pond");
    const { result } = renderHook(() => useStageScene());
    expect([result.current.scene, result.current.enabled]).toEqual(["town", false]);
  });

  test("with the koi pond unlocked: the switch, and the choice is remembered", () => {
    useUnlocks.setState({ items: ["koi-pond"], loaded: true });
    const { result } = renderHook(() => useStageScene());
    expect([result.current.scene, result.current.enabled]).toEqual(["town", true]);
    act(() => result.current.setScene("pond"));
    expect(result.current.scene).toBe("pond");
    expect(window.localStorage.getItem("lbt-stage-scene")).toBe("pond");
    expect(renderHook(() => useStageScene()).result.current.scene).toBe("pond");
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

describe("StageSceneOffer", () => {
  test("shows nothing while the pond is not on sale", () => {
    const { container } = render(<StageSceneOffer onSale={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  test("on sale: a locked pond chip that leads to the offer", () => {
    render(<StageSceneOffer onSale />);
    const link = screen.getByRole("link", { name: "lbt.pond.locked" });
    expect(link).toHaveAttribute("href", "/unlock");
    expect(screen.queryByRole("radio")).toBeNull();
  });

  test("waits for this device's unlocks before showing the lock", () => {
    useUnlocks.setState({ items: [], loaded: false });
    const { container } = render(<StageSceneOffer onSale />);
    expect(container).toBeEmptyDOMElement();
  });
});
