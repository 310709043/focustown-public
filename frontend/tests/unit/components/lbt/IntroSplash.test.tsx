/**
 * IntroSplash: plays once per tab, skips on a key or click, and stays out
 * of the way for reduced motion and automated browsers. Animation timing
 * itself is CSS and is not asserted here.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { IntroSplash } from "@/components/lbt/IntroSplash";

const intro = () => screen.queryByTestId("lbt-intro");

function setReducedMotion(reduce: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({ matches: reduce }) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  vi.useFakeTimers();
  window.sessionStorage.clear();
  setReducedMotion(false);
  Object.defineProperty(navigator, "webdriver", { value: false, configurable: true });
});

afterEach(() => {
  vi.useRealTimers();
});

test("plays, shows the tagline, then removes itself", () => {
  render(<IntroSplash tagline="今天還剩幾格電？" />);
  expect([intro() !== null, screen.getByText("今天還剩幾格電？").textContent]).toEqual([true, "今天還剩幾格電？"]);

  act(() => vi.advanceTimersByTime(2650));

  expect(intro()).toBeNull();
});

test("plays only once per tab", () => {
  render(<IntroSplash tagline="t" />).unmount();
  render(<IntroSplash tagline="t" />);
  expect(intro()).toBeNull();
});

test("any key skips it", () => {
  render(<IntroSplash tagline="t" />);
  act(() => {
    fireEvent.keyDown(window, { key: "Escape" });
    vi.advanceTimersByTime(300);
  });
  expect(intro()).toBeNull();
});

test("a click skips it", () => {
  render(<IntroSplash tagline="t" />);
  act(() => {
    fireEvent.click(screen.getByTestId("lbt-intro"));
    vi.advanceTimersByTime(300);
  });
  expect(intro()).toBeNull();
});

test("is skipped for reduced motion", () => {
  setReducedMotion(true);
  render(<IntroSplash tagline="t" />);
  expect(intro()).toBeNull();
});

test("is skipped for automated browsers", () => {
  Object.defineProperty(navigator, "webdriver", { value: true, configurable: true });
  render(<IntroSplash tagline="t" />);
  expect(intro()).toBeNull();
});

test("is hidden from assistive tech", () => {
  render(<IntroSplash tagline="t" />);
  expect(screen.getByTestId("lbt-intro").getAttribute("aria-hidden")).toBe("true");
});
