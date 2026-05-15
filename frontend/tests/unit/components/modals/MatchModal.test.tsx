/**
 * MatchModal component tests.
 *
 * Worth testing:
 * - With no current match, the modal does not render (null short-circuit).
 * - With a match, the compatibility number is displayed.
 * - Accept calls the store's accept + router.push(/focus/<id>) + onClose.
 * - Skip calls the store's skip.
 * - Close button invokes onClose.
 *
 * Not tested:
 * - The 80ms staggered bar-fill animation. Visual.
 * - The fallback character lookup when backend hasn't returned one.
 */
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { MatchModal } from "@/components/modals/MatchModal";
import { useMatchStore } from "@/lib/state/matchStore";

const pushSpy = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushSpy,
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

const baseMatch = {
  id: "m-1",
  requester_id: "u-me",
  candidate_id: "u-other",
  compatibility: 87,
  reason: "你們的興趣很合",
  status: "pending" as const,
  created_at: "2026-05-15T12:00:00Z",
};

beforeEach(() => {
  pushSpy.mockReset();
  useMatchStore.setState({
    current: null,
    proposing: false,
    accept: vi.fn().mockResolvedValue(baseMatch),
    skip: vi.fn().mockResolvedValue(undefined),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("with no current match, renders nothing", () => {
  const { container } = render(<MatchModal open={true} onClose={() => {}} />);
  expect(container).toBeEmptyDOMElement();
});

test("renders the compatibility number for the current match", () => {
  useMatchStore.setState({ current: baseMatch });
  render(<MatchModal open={true} onClose={() => {}} />);
  expect(screen.getByText(/87% MATCH/)).toBeInTheDocument();
});

test("accept calls store + router.push + onClose", async () => {
  const user = userEvent.setup();
  const acceptSpy = vi.fn().mockResolvedValue(baseMatch);
  const onClose = vi.fn();
  useMatchStore.setState({ current: baseMatch, accept: acceptSpy as never });

  render(<MatchModal open={true} onClose={onClose} />);
  await user.click(screen.getByRole("button", { name: /一起專注/ }));

  expect(acceptSpy).toHaveBeenCalled();
  expect(pushSpy).toHaveBeenCalledWith("/focus/m-1");
  expect(onClose).toHaveBeenCalled();
});

test("skip calls store.skip", async () => {
  const user = userEvent.setup();
  const skipSpy = vi.fn().mockResolvedValue(undefined);
  useMatchStore.setState({ current: baseMatch, skip: skipSpy as never });

  render(<MatchModal open={true} onClose={() => {}} />);
  await user.click(screen.getByRole("button", { name: /下一個/ }));

  expect(skipSpy).toHaveBeenCalled();
});

test("close button invokes onClose", async () => {
  const user = userEvent.setup();
  const onClose = vi.fn();
  useMatchStore.setState({ current: baseMatch });

  render(<MatchModal open={true} onClose={onClose} />);
  await user.click(screen.getByRole("button", { name: /close/i }));

  expect(onClose).toHaveBeenCalled();
});
