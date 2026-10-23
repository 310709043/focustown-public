/**
 * The street cat's layer: empty on the server and wherever the street is
 * not on screen; built and animated once it is; cleaned up on unmount.
 */
import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { StreetCat } from "@/components/lbt/StreetCat";

let frames: FrameRequestCallback[] = [];

function onScreen() {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(private readonly cb: IntersectionObserverCallback) {}
      observe() {
        this.cb([{ isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
      }
      disconnect() {}
    },
  );
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => frames.push(cb));
  vi.stubGlobal("cancelAnimationFrame", () => {
    frames = [];
  });
}

function runFrames(n: number) {
  for (let i = 0; i < n; i += 1) {
    const next = frames.shift();
    act(() => next?.(performance.now() + i * 33));
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  frames = [];
});

describe("StreetCat", () => {
  test("renders an empty layer until the street is on screen", () => {
    vi.stubGlobal("IntersectionObserver", undefined);

    const { container } = render(<StreetCat />);

    expect(container.querySelector(".tw-cat-layer")?.childElementCount).toBe(0);
  });

  test("builds the cat once the street is on screen", () => {
    onScreen();
    const { container } = render(<StreetCat />);

    runFrames(3);

    expect(container.querySelector(".tw-cat-layer .cat-hit")).not.toBeNull();
  });

  test("draws real positions, never NaN", () => {
    onScreen();
    const { container } = render(<StreetCat />);

    runFrames(30);

    expect(container.querySelector(".tw-cat-layer")?.innerHTML.includes("NaN")).toBe(false);
  });

  test("removes the cat on unmount", () => {
    onScreen();
    const { container, unmount } = render(<StreetCat />);
    const layer = container.querySelector(".tw-cat-layer") as SVGSVGElement;
    runFrames(2);

    unmount();

    expect(layer.childElementCount).toBe(0);
  });
});
