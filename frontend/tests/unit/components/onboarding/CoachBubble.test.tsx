/**
 * CoachBubble — speech-bubble UI for the onboarding tour.
 *
 * Worth testing (the conditional behavior new readers always get wrong):
 * - Last step swaps "Next ›" for "Got it" — the only state-dependent
 *   label flip and the place the tour ends.
 * - First step disables the Back button so users can't bounce off the
 *   start of the tour into an undefined state.
 * - Skip / Back / Next click handlers fire their respective callbacks.
 *
 * NOT worth testing:
 * - The `placement` style switch (visual positioning only — measured
 *   manually because it depends on viewport geometry).
 * - The `pixel-panel` decorative classes.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";

import { CoachBubble } from "@/components/onboarding/CoachBubble";

function renderBubble(
  overrides: Partial<React.ComponentProps<typeof CoachBubble>> = {},
) {
  const onSkip = vi.fn();
  const onBack = vi.fn();
  const onNext = vi.fn();
  render(
    <CoachBubble
      eyebrow="MODE 1 OF 3"
      title="CITY"
      body="You're already in it."
      stepIndex={1}
      isFirst={false}
      isLast={false}
      placement="bottom"
      onSkip={onSkip}
      onBack={onBack}
      onNext={onNext}
      {...overrides}
    />,
  );
  return { onSkip, onBack, onNext };
}

test("renders the title", () => {
  renderBubble({ title: "CITY" });
  expect(screen.getByText("CITY")).toBeInTheDocument();
});

test("renders the body copy", () => {
  renderBubble({ body: "You're already in it." });
  expect(screen.getByText("You're already in it.")).toBeInTheDocument();
});

test("Next button label says next when not last", () => {
  renderBubble({ isLast: false });
  expect(screen.getByTestId("onboarding-next")).toHaveTextContent(/next/i);
});

test("Next button label flips to done on the last step", () => {
  renderBubble({ isLast: true });
  expect(screen.getByTestId("onboarding-next")).toHaveTextContent(/done/i);
});

test("Back button is disabled on the first step", () => {
  renderBubble({ isFirst: true });
  expect(screen.getByTestId("onboarding-back")).toBeDisabled();
});

test("Back button is enabled past the first step", () => {
  renderBubble({ isFirst: false });
  expect(screen.getByTestId("onboarding-back")).toBeEnabled();
});

test("clicking Skip fires onSkip", () => {
  const { onSkip } = renderBubble();
  fireEvent.click(screen.getByTestId("onboarding-skip"));
  expect(onSkip).toHaveBeenCalledOnce();
});

test("clicking Back fires onBack", () => {
  const { onBack } = renderBubble({ isFirst: false });
  fireEvent.click(screen.getByTestId("onboarding-back"));
  expect(onBack).toHaveBeenCalledOnce();
});

test("clicking Next fires onNext", () => {
  const { onNext } = renderBubble();
  fireEvent.click(screen.getByTestId("onboarding-next"));
  expect(onNext).toHaveBeenCalledOnce();
});
