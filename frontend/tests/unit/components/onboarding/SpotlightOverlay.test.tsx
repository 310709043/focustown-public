/**
 * SpotlightOverlay — dim overlay + animated ring around a target.
 *
 * Worth testing:
 * - With no `targetSelector` (welcome / done steps), only the dim overlay
 *   renders — there is no ring. The default-null branch is the one that
 *   is easiest to silently break when the props evolve.
 * - With a `targetSelector` that resolves to a real DOM node, the ring
 *   renders. This proves the querySelector + measure path executes.
 * - With a `targetSelector` that doesn't resolve, no ring renders. This
 *   is the failure mode we get when a downstream component is renamed
 *   without updating the tour config — the tour should keep working
 *   without crashing.
 *
 * NOT worth testing:
 * - The exact CSS pixel positions — they depend on
 *   `getBoundingClientRect`, which jsdom returns as zero, and the value
 *   doesn't matter for the existence assertion.
 * - The ResizeObserver wiring — stubbed in tests/setup.ts.
 */
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { SpotlightOverlay } from "@/components/onboarding/SpotlightOverlay";

test("dims the screen with no ring when targetSelector is null", () => {
  render(<SpotlightOverlay targetSelector={null} />);

  expect(screen.getByTestId("onboarding-overlay")).toBeInTheDocument();
  expect(
    screen.queryByTestId("onboarding-spotlight-ring"),
  ).not.toBeInTheDocument();
});

test("renders the dashed ring when targetSelector resolves to a DOM node", () => {
  // The overlay's `useEffect` runs querySelector against `document`,
  // so we need a real node in the DOM that matches the selector.
  document.body.insertAdjacentHTML(
    "beforeend",
    '<div data-testid="spotlight-target">x</div>',
  );

  render(<SpotlightOverlay targetSelector='[data-testid="spotlight-target"]' />);

  expect(screen.getByTestId("onboarding-spotlight-ring")).toBeInTheDocument();
});

test("does not render the ring when targetSelector misses every node", () => {
  render(<SpotlightOverlay targetSelector="#never-exists" />);

  expect(
    screen.queryByTestId("onboarding-spotlight-ring"),
  ).not.toBeInTheDocument();
});

test("always renders the dim overlay regardless of target state", () => {
  // Same as above — overlay must remain so the screen stays dimmed,
  // even when there is no specific target to highlight.
  render(<SpotlightOverlay targetSelector="#never-exists" />);

  expect(screen.getByTestId("onboarding-overlay")).toBeInTheDocument();
});
