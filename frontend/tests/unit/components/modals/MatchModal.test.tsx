/**
 * MatchModal status-driven render branches.
 *
 * Worth testing:
 * - The "proposed" branch resolves the character sprite from
 *   ``candidate_character_key`` (and not the candidate_id UUID, which is
 *   the regression that motivated this test originally).
 * - The "waiting" branch renders the pulsing placeholder + elapsed
 *   counter + CANCEL button rather than the partner UI — proves the
 *   three-branch render keys off ``status``.
 * - When ``status === "idle"`` the modal does not render anything (it
 *   relies on the store, not on a parent prop, so there's no "open=true,
 *   status=idle" edge case to worry about).
 *
 * NOT worth testing:
 * - The full visual chrome — covered by manual review.
 */
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { render } from "@testing-library/react";

import { MatchModal } from "@/components/modals/MatchModal";
import { useMatchStore } from "@/lib/state/matchStore";
import { makeMatch } from "@/tests/fixtures/factories";

vi.mock("@/i18n/routing", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

beforeEach(() => {
  useMatchStore.setState({
    status: "idle",
    current: null,
    accepted: null,
    waitingSince: null,
    botFallbackAt: null,
    cancelling: false,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("idle status renders nothing", () => {
  const { container } = render(<MatchModal />);
  expect(container.firstChild).toBeNull();
});

test("proposed branch resolves sprite from candidate_character_key", () => {
  useMatchStore.setState({
    status: "proposed",
    current: makeMatch({
      id: "m-1",
      candidate_id: "uuid-not-a-key",
      candidate_character_key: "luna",
      compatibility: 80,
    }),
  });

  const { getByText } = render(<MatchModal />);

  expect(getByText("🐱")).toBeInTheDocument();
  expect(getByText("Luna")).toBeInTheDocument();
});

test("proposed branch falls back to ❓ when character_key is unknown", () => {
  useMatchStore.setState({
    status: "proposed",
    current: makeMatch({
      id: "m-2",
      candidate_id: "another-uuid",
      candidate_character_key: null,
      compatibility: 60,
    }),
  });

  const { getByText } = render(<MatchModal />);

  expect(getByText("❓")).toBeInTheDocument();
});

test("waiting branch renders the waiting placeholder + cancel button", () => {
  useMatchStore.setState({
    status: "waiting",
    waitingSince: Date.now(),
    botFallbackAt: Date.now() + 28_000,
  });

  const { getByTestId } = render(<MatchModal />);

  // pulsing "?" avatar replaces the partner sprite in the waiting branch
  expect(getByTestId("match-waiting-avatar")).toBeInTheDocument();
  expect(getByTestId("match-cancel")).toBeInTheDocument();
});
