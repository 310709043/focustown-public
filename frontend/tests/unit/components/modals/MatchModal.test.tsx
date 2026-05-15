/**
 * MatchModal character-sprite resolution.
 *
 * Worth testing:
 * - Resolving the candidate sprite by ``candidate_character_key`` (the new
 *   field the backend now hydrates). The previous code looked up by
 *   ``candidate_id`` (a UUID), which always missed — the modal rendered ❓
 *   for every match. This test pins the fix.
 * - The null fallback path still renders so partial/legacy WS payloads
 *   don't crash the modal.
 *
 * NOT worth testing:
 * - The full visual chrome (rotating halo, segmented bar) — covered by
 *   manual review and not stable across CSS tweaks.
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
  useMatchStore.setState({ current: null, proposing: false });
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("renders the character sprite resolved from candidate_character_key", () => {
  useMatchStore.setState({
    current: makeMatch({
      id: "m-1",
      candidate_id: "uuid-not-a-key",
      candidate_character_key: "luna",
      compatibility: 80,
    }),
  });

  const { getByText } = render(<MatchModal open onClose={() => {}} />);

  // Luna's emoji + display name come from CHARACTERS in
  // frontend/lib/data/characters.ts. If MatchModal regresses to the old
  // UUID lookup, both assertions break.
  expect(getByText("🐱")).toBeInTheDocument();
  expect(getByText("Luna")).toBeInTheDocument();
});

test("falls back to ❓ when candidate_character_key is null", () => {
  useMatchStore.setState({
    current: makeMatch({
      id: "m-2",
      candidate_id: "another-uuid",
      candidate_character_key: null,
      compatibility: 60,
    }),
  });

  const { getByText } = render(<MatchModal open onClose={() => {}} />);

  expect(getByText("❓")).toBeInTheDocument();
});
