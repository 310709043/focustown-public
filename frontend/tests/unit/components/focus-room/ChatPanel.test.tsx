/**
 * ChatPanel component tests.
 *
 * Worth testing:
 * - Pressing Enter in the input sends a chat message via useRealtime.
 * - Clicking the Send button sends a chat message.
 * - Empty input is a no-op (we trim before send; no send call should fire).
 * - Incoming chat messages from other users render in the list.
 *
 * Not tested:
 * - Scroll-into-view on new message — DOM ref behaviour, low signal.
 * - The "join" payload sent on mount — implementation detail of how we
 *   subscribe; the contract is "messages from this room appear", which
 *   the incoming-message test already covers.
 */
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ChatPanel } from "@/components/focus-room/ChatPanel";

const sendSpy = vi.fn();
let pushIncoming: ((msg: Record<string, unknown>) => void) | null = null;

vi.mock("@/lib/ws/useRealtime", () => ({
  useRealtime: (handler: (msg: Record<string, unknown>) => void) => {
    pushIncoming = handler;
    return { send: sendSpy };
  },
}));

beforeEach(() => {
  sendSpy.mockReset();
  pushIncoming = null;
});

afterEach(() => {
  vi.restoreAllMocks();
});

const ROOM = "room-abc-123";
const ME = "u-me";

test("pressing Enter sends a chat message", async () => {
  const user = userEvent.setup();
  render(<ChatPanel roomId={ROOM} myUserId={ME} />);

  await user.type(screen.getByPlaceholderText("說點什麼..."), "hello{Enter}");

  expect(sendSpy).toHaveBeenCalledWith({
    type: "chat",
    room_id: ROOM,
    text: "hello",
  });
});

test("clicking Send sends a chat message", async () => {
  const user = userEvent.setup();
  render(<ChatPanel roomId={ROOM} myUserId={ME} />);

  await user.type(screen.getByPlaceholderText("說點什麼..."), "hi");
  await user.click(screen.getByRole("button", { name: "送出" }));

  expect(sendSpy).toHaveBeenCalledWith({
    type: "chat",
    room_id: ROOM,
    text: "hi",
  });
});

test("empty input is not sent", async () => {
  const user = userEvent.setup();
  render(<ChatPanel roomId={ROOM} myUserId={ME} />);

  await user.click(screen.getByRole("button", { name: "送出" }));
  await user.type(screen.getByPlaceholderText("說點什麼..."), "   {Enter}");

  // Calls allowed during mount: ChatPanel sends `{type:"join", room_id}` on
  // mount. We assert no *chat* messages were sent.
  const chatCalls = sendSpy.mock.calls.filter(
    ([payload]) => (payload as { type: string }).type === "chat",
  );
  expect(chatCalls).toEqual([]);
});

test("incoming chat from another user renders in the list", () => {
  render(<ChatPanel roomId={ROOM} myUserId={ME} />);

  // Dispatch from outside React → wrap in act() so the setState flush is
  // applied before our assertion.
  act(() => {
    pushIncoming!({
      type: "chat",
      room_id: ROOM,
      from: "u-other",
      text: "hi from across the room",
    });
  });

  expect(
    screen.getByText("hi from across the room"),
  ).toBeInTheDocument();
});
