/**
 * FriendRow renders the right CTAs per tab.
 *
 * Regression cover for 2026-05-24: accepted-friends rows now expose
 * a 🎁 gift button that opens GiftDialog with the friend's user_id
 * pre-filled. The button must NOT appear on incoming / outgoing tabs,
 * and must NOT appear at all if the caller doesn't supply `onGift`
 * (older surfaces stay unchanged).
 *
 * Worth testing:
 *  - "friends" tab + onGift supplied → gift button + unfriend button.
 *  - "friends" tab + no onGift → no gift button (back-compat).
 *  - "incoming" tab → Accept / Decline only, no gift (you can't gift
 *    someone who isn't your friend yet).
 *  - "outgoing" tab → cancel-request button only.
 *  - Clicking gift invokes onGift().
 */
import { afterEach, expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { FriendRow } from "@/components/profile/friends/FriendRow";
import type { FriendSummary } from "@/lib/api/endpoints";

function makeFriend(overrides: Partial<FriendSummary> = {}): FriendSummary {
  return {
    friendship_id: "f-1",
    user_id: "u-other",
    display_name: "Bob",
    character_key: "luna",
    status: "accepted",
    requested_by_me: false,
    created_at: "2026-05-20T12:00:00Z",
    accepted_at: "2026-05-20T12:05:00Z",
    ...overrides,
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

test("accepted-friends tab renders the gift CTA when onGift is provided", () => {
  const onGift = vi.fn();
  render(
    <FriendRow
      friend={makeFriend()}
      tab="friends"
      onAccept={vi.fn()}
      onReject={vi.fn()}
      onUnfriend={vi.fn()}
      onGift={onGift}
    />,
  );

  expect(screen.getByTestId("friend-row-gift")).toBeInTheDocument();
});

test("clicking the gift CTA invokes onGift", () => {
  const onGift = vi.fn();
  render(
    <FriendRow
      friend={makeFriend()}
      tab="friends"
      onAccept={vi.fn()}
      onReject={vi.fn()}
      onUnfriend={vi.fn()}
      onGift={onGift}
    />,
  );

  fireEvent.click(screen.getByTestId("friend-row-gift"));
  expect(onGift).toHaveBeenCalledOnce();
});

test("gift CTA is absent on the friends tab when onGift isn't supplied", () => {
  // Back-compat: older callers that don't pass onGift keep the row
  // visually identical (only the unfriend control).
  render(
    <FriendRow
      friend={makeFriend()}
      tab="friends"
      onAccept={vi.fn()}
      onReject={vi.fn()}
      onUnfriend={vi.fn()}
    />,
  );

  expect(screen.queryByTestId("friend-row-gift")).toBeNull();
});

test("gift CTA is absent on the incoming tab even when onGift is provided", () => {
  // Defensive: never let the caller accidentally show a gift button
  // on a pending request — at this point the friendship doesn't exist,
  // and the backend would reject the gift with target_user_not_found.
  render(
    <FriendRow
      friend={makeFriend({ status: "requested" })}
      tab="incoming"
      onAccept={vi.fn()}
      onReject={vi.fn()}
      onUnfriend={vi.fn()}
      onGift={vi.fn()}
    />,
  );

  expect(screen.queryByTestId("friend-row-gift")).toBeNull();
});

test("gift CTA is absent on the outgoing tab even when onGift is provided", () => {
  render(
    <FriendRow
      friend={makeFriend({ status: "requested", requested_by_me: true })}
      tab="outgoing"
      onAccept={vi.fn()}
      onReject={vi.fn()}
      onUnfriend={vi.fn()}
      onGift={vi.fn()}
    />,
  );

  expect(screen.queryByTestId("friend-row-gift")).toBeNull();
});
