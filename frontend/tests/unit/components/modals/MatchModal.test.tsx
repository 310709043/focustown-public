/**
 * MatchModal status-driven render branches.
 *
 * Per the 2026-05-22 product redesign the modal collapsed to a single
 * waiting branch — the user no longer sees a partner preview or chooses
 * Accept / Skip. These tests cover the surviving render contract:
 *
 *  - status === "idle"      → renders nothing
 *  - status === "waiting"   → pulsing avatar + cancel button
 *  - status === "accepting" → modal stays mounted with the
 *    "Joining…" copy so the rotating halo doesn't blink out before
 *    the page-level effect navigates to /focus/{matchId}
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

test("accepting branch keeps the modal mounted with loading copy", () => {
  useMatchStore.setState({
    status: "accepting",
    current: makeMatch({ id: "m-1", candidate_character_key: "luna" }),
  });

  const { getByTestId } = render(<MatchModal />);

  // The avatar+cancel chrome stays so the rotating halo doesn't blink
  // out before the page-level nav fires. Cancel button is disabled in
  // accepting state (page is about to navigate).
  expect(getByTestId("match-waiting-avatar")).toBeInTheDocument();
  const cancel = getByTestId("match-cancel");
  expect(cancel).toBeInTheDocument();
  expect(cancel).toBeDisabled();
});
