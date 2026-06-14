/**
 * ModeCard — generic mode tile (Solo / Together / future modes).
 *
 * Worth testing:
 * - title + description render where MatchPanel expects them
 * - CTA click fires the handler (the only mutation surface)
 * - disabled = true blocks the CTA so we don't dispatch a second match
 *   request while one is still in flight
 * - Optional badge / extra slots actually appear when supplied — these
 *   carry the "Resume · {partner}" hint and the avatar strip.
 *
 * NOT worth testing:
 * - The exact CSS values (border color, glow box-shadow) — covered by
 *   visual review, not stable across token tweaks.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";

import { ModeCard } from "@/components/town/bottom/ModeCard";

function renderCard(overrides: Partial<React.ComponentProps<typeof ModeCard>> = {}) {
  const onCta = vi.fn();
  render(
    <ModeCard
      testId="mode-card-test"
      icon="🔋"
      title="SOLO"
      description="Private chamber"
      ctaLabel="Enter ▶"
      ctaAriaLabel="Enter Solo"
      onCta={onCta}
      {...overrides}
    />,
  );
  return { onCta };
}

test("renders the title", () => {
  renderCard({ title: "SOLO" });
  expect(screen.getByText("SOLO")).toBeInTheDocument();
});

test("renders the description", () => {
  renderCard({ description: "Private chamber" });
  expect(screen.getByText("Private chamber")).toBeInTheDocument();
});

test("clicking the CTA fires onCta", () => {
  const { onCta } = renderCard();
  fireEvent.click(screen.getByTestId("mode-card-test-cta"));
  expect(onCta).toHaveBeenCalledOnce();
});

test("disabled CTA does not fire onCta when clicked", () => {
  const { onCta } = renderCard({ disabled: true });
  fireEvent.click(screen.getByTestId("mode-card-test-cta"));
  expect(onCta).not.toHaveBeenCalled();
});

test("renders the optional badge when supplied", () => {
  renderCard({ badge: "with Luna" });
  expect(screen.getByText("with Luna")).toBeInTheDocument();
});

test("renders the optional extra slot when supplied", () => {
  renderCard({ extra: <span data-testid="card-extra">avatars</span> });
  expect(screen.getByTestId("card-extra")).toBeInTheDocument();
});

test("CTA ariaLabel is propagated to the button", () => {
  renderCard({ ctaAriaLabel: "Resume your accepted match" });
  expect(
    screen.getByRole("button", { name: "Resume your accepted match" }),
  ).toBeInTheDocument();
});
