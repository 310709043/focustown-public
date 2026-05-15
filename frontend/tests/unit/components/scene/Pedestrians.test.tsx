/**
 * Regression tests for the Pedestrians infinite-render bug.
 *
 * Background:
 *   The original selector was `usePresenceStore((s) => Object.values(s.byId))`
 *   which returns a fresh array reference on every read. Zustand's
 *   `useSyncExternalStore` adapter compares snapshots with `Object.is`, so a
 *   new reference is treated as a state change, triggering another render,
 *   which calls the selector again, which returns another new reference…
 *   React surfaces the loop as:
 *     - "The result of getSnapshot should be cached to avoid an infinite loop"
 *     - "Cannot update a component while rendering a different component"
 *
 *   Fix: wrap the selector in `useShallow` so identity is compared
 *   element-by-element, not by reference.
 *
 * What these tests pin:
 *   1. Mounting Pedestrians with state in the store does NOT trigger the
 *      getSnapshot / max-update-depth warnings.
 *   2. Re-rendering with the SAME state stays cheap (the selector is stable).
 *   3. Mutating the store produces a re-render that includes the new user.
 *
 * Why not just snapshot the DOM:
 *   The DOM contains randomised animation timings; snapshots would flake
 *   on every CSS tweak. The invariant ("selector must be referentially
 *   stable under unchanged state") is the load-bearing rule.
 */
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, render } from "@testing-library/react";

import type { StreetUser } from "@/lib/api/types.gen";
import { Pedestrians } from "@/components/scene/Pedestrians";
import { useAuthStore } from "@/lib/state/authStore";
import { usePresenceStore } from "@/lib/state/presenceStore";

// Both IDs deterministically hash to entityKind="walker" via
// `entityKindFor`. Pedestrians now filters by that bucket, so a regression
// test about the *selector* must pick IDs in the same bucket — otherwise
// the entity-routing filter, not the selector, would explain why they're
// missing from the DOM. (verified by running entityKindFor on each.)
const alice: StreetUser = {
  id: "u-alice",
  display_name: "Alice",
  character_key: null,
  status: "afk",
  vehicle: null,
};

const eve: StreetUser = {
  id: "u-eve",
  display_name: "Eve",
  character_key: null,
  status: "afk",
  vehicle: null,
};

beforeEach(() => {
  usePresenceStore.setState({ byId: { "u-alice": alice }, pendingRehydrate: false });
  useAuthStore.setState({ user: null, loading: false, error: null });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function relevantErrors(spy: ReturnType<typeof vi.spyOn>): string[] {
  // Filter out unrelated React warnings (e.g. `act()` chatter under jsdom)
  // and only retain the two signatures this regression is about.
  return spy.mock.calls
    .map((args) => String(args[0] ?? ""))
    .filter(
      (m) =>
        m.includes("getSnapshot should be cached") ||
        m.includes("Maximum update depth") ||
        m.includes("Cannot update a component"),
    );
}

test("mounts without infinite-loop / setState-in-render warnings", () => {
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  render(<Pedestrians />);
  expect(relevantErrors(errorSpy)).toEqual([]);
});

test("re-rendering with unchanged state stays stable (selector is shallow)", () => {
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  const { rerender } = render(<Pedestrians />);
  // Force two extra renders with the SAME store state. If the selector
  // returned a fresh array, Zustand would notify and we'd see the loop.
  rerender(<Pedestrians />);
  rerender(<Pedestrians />);
  expect(relevantErrors(errorSpy)).toEqual([]);
});

test("new presence entry causes a clean re-render", () => {
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  // One <div class="animate-userPop"> per pedestrian. Counting these is more
  // stable than asserting on display_name, because the visible label is
  // derived from CHARACTERS via stableHash(user.id), not from the raw user
  // object.
  const { container } = render(<Pedestrians />);
  expect(container.querySelectorAll(".animate-userPop")).toHaveLength(1);

  act(() => {
    usePresenceStore.setState({ byId: { "u-alice": alice, "u-eve": eve } });
  });

  expect(container.querySelectorAll(".animate-userPop")).toHaveLength(2);
  expect(relevantErrors(errorSpy)).toEqual([]);
});
