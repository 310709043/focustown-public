/**
 * MatchPanel — Solo + Together mode cards inside the BottomHUD.
 *
 * Worth testing (the parts where matchStore state shapes the UI):
 * - Solo card CTA pushes /focus/solo — the only client-side route into
 *   solo mode.
 * - Together CTA calls onFindBuddy when no match has been accepted yet
 *   (default first-visit path → MatchModal opens).
 * - Together CTA flips to a "Resume" affordance pointing at
 *   /focus/{matchId} when matchStore.accepted is populated — this is
 *   the bug-prone path because we read partner metadata off the
 *   accepted match instead of the live `current` proposal.
 * - Together CTA is disabled while matchStore.proposing is true, except
 *   when an accepted match is already present (Resume should still work
 *   even during another proposal in flight).
 *
 * NOT worth testing:
 * - The dashed-question-mark placeholder vs. partner sprite — visual
 *   shape only, no router/store side effects.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { MatchPanel } from "@/components/town/bottom/MatchPanel";
import { useAuthStore } from "@/lib/state/authStore";
import { useMatchStore } from "@/lib/state/matchStore";
import { makeMatch, makeUser } from "@/tests/fixtures/factories";

const pushMock = vi.fn();

vi.mock("@/i18n/routing", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
}));

beforeEach(() => {
  pushMock.mockReset();
  useAuthStore.setState({ user: makeUser({ id: "u-1" }) });
  useMatchStore.setState({
    current: null,
    accepted: null,
    proposing: false,
    accepting: false,
    skipping: false,
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

test("SOLO card CTA routes to /focus/solo", () => {
  render(<MatchPanel onFindBuddy={vi.fn()} />);

  fireEvent.click(screen.getByTestId("mode-card-solo-cta"));

  expect(pushMock).toHaveBeenCalledWith("/focus/solo");
});

test("TOGETHER card CTA calls onFindBuddy when no match has been accepted", () => {
  const onFindBuddy = vi.fn();
  render(<MatchPanel onFindBuddy={onFindBuddy} />);

  fireEvent.click(screen.getByTestId("mode-card-together-cta"));

  expect(onFindBuddy).toHaveBeenCalledOnce();
  expect(pushMock).not.toHaveBeenCalled();
});

test("TOGETHER card flips to Resume routing to /focus/{matchId} when a match is accepted", () => {
  useMatchStore.setState({
    accepted: makeMatch({
      id: "m-accepted-1",
      status: "accepted",
      requester_id: "u-1",
      candidate_id: "u-2",
      candidate_character_key: "luna",
    }),
  });
  const onFindBuddy = vi.fn();
  render(<MatchPanel onFindBuddy={onFindBuddy} />);

  fireEvent.click(screen.getByTestId("mode-card-together-cta"));

  expect(pushMock).toHaveBeenCalledWith("/focus/m-accepted-1");
  expect(onFindBuddy).not.toHaveBeenCalled();
});

test("TOGETHER CTA is disabled while matchStore.proposing is true (no accepted match)", () => {
  useMatchStore.setState({ proposing: true });
  const onFindBuddy = vi.fn();
  render(<MatchPanel onFindBuddy={onFindBuddy} />);

  fireEvent.click(screen.getByTestId("mode-card-together-cta"));

  expect(onFindBuddy).not.toHaveBeenCalled();
});

test("TOGETHER CTA stays clickable in Resume mode even while a new proposal is in flight", () => {
  // User has an accepted match AND another proposal is being requested
  // somewhere else. The Resume affordance should still let them re-enter
  // the existing room.
  useMatchStore.setState({
    proposing: true,
    accepted: makeMatch({
      id: "m-accepted-2",
      status: "accepted",
    }),
  });
  render(<MatchPanel onFindBuddy={vi.fn()} />);

  fireEvent.click(screen.getByTestId("mode-card-together-cta"));

  expect(pushMock).toHaveBeenCalledWith("/focus/m-accepted-2");
});
