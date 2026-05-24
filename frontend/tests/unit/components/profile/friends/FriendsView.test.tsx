/**
 * FriendsView — verify the 2026-05-24 gift-from-friend-row integration.
 *
 * The view now mounts a GiftDialog at the bottom that's opened by the
 * 🎁 button on each accepted-friends row. When opened, the dialog
 * must:
 *  - Become visible (state: giftTarget !== null).
 *  - Receive the friend's user_id as the prefilledRecipient.
 *
 * Worth testing:
 *  - Dialog is closed by default.
 *  - Clicking a friend row's gift button opens the dialog.
 *  - The recipient input is pre-filled with the friend's user_id and
 *    locked (readOnly) so it can't be retargeted by accident.
 *
 * NOT worth testing:
 *  - The actual gift HTTP call — covered by GiftDialog.test.tsx.
 *  - The friend list rendering — covered by FriendRow.test.tsx and
 *    the store selector unit tests.
 */
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { FriendsView } from "@/components/profile/friends/FriendsView";
import { useAuthStore } from "@/lib/state/authStore";
import { useFriendsStore } from "@/lib/state/friendsStore";
import { makeUser } from "@/tests/fixtures/factories";
import { server } from "@/tests/setup";
import { http, HttpResponse } from "msw";

const BASE = "http://localhost:8000";

const BOB = {
  friendship_id: "f-bob",
  user_id: "u-bob",
  display_name: "Bob",
  character_key: "luna",
  status: "accepted" as const,
  requested_by_me: false,
  created_at: "2026-05-20T12:00:00Z",
  accepted_at: "2026-05-20T12:05:00Z",
};

beforeEach(() => {
  useAuthStore.setState({
    user: makeUser({ id: "u-viewer", display_name: "Viewer" }),
    loading: false,
    error: null,
  });
  useFriendsStore.setState({ byFriendshipId: {}, focusingNow: [] });

  // FriendsView's mount effect calls friendsApi.list("accepted") and
  // list("requested") in parallel and overwrites the store with the
  // result. Drive the test through that real fetch path so the store
  // doesn't get clobbered to {} after we hand it a row.
  server.use(
    http.get(`${BASE}/api/v1/friends`, ({ request }) => {
      const url = new URL(request.url);
      const status = url.searchParams.get("status");
      const items = status === "accepted" ? [BOB] : [];
      return HttpResponse.json({ items, next_cursor: null });
    }),
  );
});

afterEach(() => {
  vi.clearAllMocks();
});

test("gift dialog is closed by default", async () => {
  render(<FriendsView onClose={vi.fn()} />);

  // Wait for the loading flag to settle so the row is actually mounted.
  await waitFor(() => {
    expect(screen.getByTestId("friend-row")).toBeInTheDocument();
  });

  expect(screen.queryByTestId("wallet-gift-dialog")).toBeNull();
});

test("clicking a friend row's gift button opens the dialog with the recipient locked", async () => {
  render(<FriendsView onClose={vi.fn()} />);

  await waitFor(() => {
    expect(screen.getByTestId("friend-row-gift")).toBeInTheDocument();
  });

  fireEvent.click(screen.getByTestId("friend-row-gift"));

  // Dialog now visible.
  const dialog = await screen.findByTestId("wallet-gift-dialog");
  expect(dialog).toBeInTheDocument();

  // Recipient input is locked to the friend's user_id — prevents
  // re-targeting by typing over the pre-fill.
  const recipientInputs = dialog.querySelectorAll("input");
  const recipientInput = recipientInputs[0] as HTMLInputElement;
  expect(recipientInput.value).toBe("u-bob");
  expect(recipientInput).toHaveAttribute("readonly");
});
