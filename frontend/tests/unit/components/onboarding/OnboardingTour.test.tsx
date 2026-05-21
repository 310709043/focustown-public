/**
 * OnboardingTour — orchestrator that auto-fires on first visit and
 * survives a refresh once dismissed.
 *
 * Worth testing (the wiring between the store and the visible UI):
 * - Auto-starts after the boot delay when `completed === false`.
 * - Does NOT start when `completed === true` (returning user) — without
 *   this guard we'd re-spotlight users on every page load.
 * - Skipping the tour hides it AND marks the store completed so a
 *   refresh leaves them alone.
 * - The ESC key dismisses an active tour.
 *
 * NOT worth testing:
 * - The SpotlightOverlay ring measurement — that's geometry, tested by
 *   visual inspection.
 * - i18n copy specifics — covered by next-intl namespace contract.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { OnboardingTour } from "@/components/onboarding/OnboardingTour";
import { useOnboardingStore } from "@/lib/state/onboardingStore";

beforeEach(() => {
  vi.useFakeTimers();
  useOnboardingStore.setState({
    completed: false,
    active: false,
    currentStep: 0,
    // Default to hydrated so existing tests aren't gated. The audit F4
    // test below flips this to false explicitly.
    hasHydrated: true,
  });
});

afterEach(() => {
  vi.useRealTimers();
  useOnboardingStore.setState({
    completed: false,
    active: false,
    currentStep: 0,
    hasHydrated: false,
  });
  // Clean up any DOM elements injected by individual tests.
  document.body.innerHTML = "";
});

test("does not render anything when active is false", () => {
  render(<OnboardingTour />);
  expect(screen.queryByTestId("onboarding-bubble")).not.toBeInTheDocument();
});

test("auto-starts after boot delay when completed=false", () => {
  render(<OnboardingTour />);

  act(() => {
    vi.advanceTimersByTime(800);
  });

  expect(useOnboardingStore.getState().active).toBe(true);
  expect(screen.getByTestId("onboarding-bubble")).toBeInTheDocument();
});

test("does NOT auto-start when completed=true (returning user)", () => {
  useOnboardingStore.setState({ completed: true });

  render(<OnboardingTour />);

  act(() => {
    vi.advanceTimersByTime(2000);
  });

  expect(useOnboardingStore.getState().active).toBe(false);
  expect(screen.queryByTestId("onboarding-bubble")).not.toBeInTheDocument();
});

test("Skip button hides the tour and persists completed=true", () => {
  useOnboardingStore.setState({ active: true, completed: false });

  render(<OnboardingTour />);
  fireEvent.click(screen.getByTestId("onboarding-skip"));

  const state = useOnboardingStore.getState();
  expect(state.active).toBe(false);
  expect(state.completed).toBe(true);
});

test("ESC key skips an active tour", () => {
  useOnboardingStore.setState({ active: true, completed: false });

  render(<OnboardingTour />);
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  });

  expect(useOnboardingStore.getState().active).toBe(false);
  expect(useOnboardingStore.getState().completed).toBe(true);
});

test("does NOT auto-start until persist rehydration completes (audit F4)", () => {
  // hasHydrated=false simulates the brief window where zustand hasn't
  // finished reading localStorage. Boot timer must not fire — otherwise
  // a returning user with `completed: true` in storage sees the welcome
  // bubble flash before rehydration lands.
  useOnboardingStore.setState({ hasHydrated: false, completed: false });

  render(<OnboardingTour />);

  act(() => {
    vi.advanceTimersByTime(2000);
  });

  expect(useOnboardingStore.getState().active).toBe(false);
  expect(screen.queryByTestId("onboarding-bubble")).not.toBeInTheDocument();
});

test("does NOT auto-start when a modal is open (audit F2)", () => {
  // Audit F2: the tour overlay must not dim the screen behind an open
  // modal. We inject a backdrop testid that matches the heuristic
  // selector OnboardingTour uses to detect "modal is open".
  document.body.insertAdjacentHTML(
    "beforeend",
    '<div data-testid="some-modal-backdrop"></div>',
  );

  render(<OnboardingTour />);

  act(() => {
    vi.advanceTimersByTime(2000);
  });

  expect(useOnboardingStore.getState().active).toBe(false);
});

test("Next button on the welcome step advances to step 1", () => {
  useOnboardingStore.setState({ active: true, currentStep: 0 });

  render(<OnboardingTour />);
  fireEvent.click(screen.getByTestId("onboarding-next"));

  expect(useOnboardingStore.getState().currentStep).toBe(1);
});
