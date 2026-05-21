/**
 * useRealtimeSessionCompleted — narrow handler for session.completed frames.
 *
 * Worth testing:
 * - session.completed dispatches onCompleted with the session_id string
 * - irrelevant message types do not fire the callback
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

import { useRealtimeSessionCompleted } from "@/lib/ws/useRealtimeSessionCompleted";

beforeEach(() => {
  _handler = null;
});

test("session.completed dispatches onCompleted with the session id", () => {
  const onCompleted = vi.fn();
  renderHook(() => useRealtimeSessionCompleted(onCompleted));

  _handler!({ type: "session.completed", session_id: "s-99" });

  expect(onCompleted).toHaveBeenCalledWith("s-99");
});

test("other message types do not invoke onCompleted", () => {
  const onCompleted = vi.fn();
  renderHook(() => useRealtimeSessionCompleted(onCompleted));

  _handler!({ type: "chat", room_id: "r-1", text: "hi" });
  _handler!({ type: "match.proposed", match_id: "m-1", from: "u-1" });

  expect(onCompleted).not.toHaveBeenCalled();
});
