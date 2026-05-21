/**
 * useRealtimeMatch — translates WS frames into match callbacks.
 *
 * Worth testing:
 * - match.proposed payload is synthesised into a partial Match handed to onProposed
 * - match.accepted payload calls onAccepted with the match_id string
 * - irrelevant message types do not call either handler
 * - missing handlers are tolerated (the hook is opt-in per consumer)
 */
import { renderHook } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";

let _handler: ((msg: unknown) => void) | null = null;

vi.mock("@/lib/ws/useRealtime", () => ({
  useRealtime: (handler: (msg: unknown) => void) => {
    _handler = handler;
    return null;
  },
}));

import { useRealtimeMatch } from "@/lib/ws/useRealtimeMatch";

beforeEach(() => {
  _handler = null;
});

test("match.proposed synthesises a Match for onProposed", () => {
  const onProposed = vi.fn();
  renderHook(() => useRealtimeMatch({ onProposed }));

  _handler!({
    type: "match.proposed",
    match_id: "m-1",
    from: "u-bob",
    compatibility: 88,
  });

  expect(onProposed).toHaveBeenCalledOnce();
  const m = onProposed.mock.calls[0][0];
  expect(m.id).toBe("m-1");
  expect(m.requester_id).toBe("u-bob");
  // Recipient sees the proposer in BOTH slots — UI rendering reads
  // candidate_character_key for the avatar.
  expect(m.candidate_id).toBe("u-bob");
  expect(m.compatibility).toBe(88);
  expect(m.status).toBe("pending");
});

test("match.accepted invokes onAccepted with the match id string", () => {
  const onAccepted = vi.fn();
  renderHook(() => useRealtimeMatch({ onAccepted }));

  _handler!({ type: "match.accepted", match_id: "m-42" });

  expect(onAccepted).toHaveBeenCalledWith("m-42");
});

test("unrelated WS frames do not trigger either handler", () => {
  const onProposed = vi.fn();
  const onAccepted = vi.fn();
  renderHook(() => useRealtimeMatch({ onProposed, onAccepted }));

  _handler!({ type: "chat", room_id: "r-1", text: "hi", from: "u-x" });

  expect(onProposed).not.toHaveBeenCalled();
  expect(onAccepted).not.toHaveBeenCalled();
});

test("match.proposed without onProposed handler is tolerated (no throw)", () => {
  renderHook(() => useRealtimeMatch({}));

  // Must not throw even when no callback was supplied.
  _handler!({
    type: "match.proposed",
    match_id: "m-1",
    from: "u-x",
    compatibility: 50,
  });
});
