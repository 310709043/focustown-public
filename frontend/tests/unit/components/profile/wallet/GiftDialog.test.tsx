/**
 * GiftDialog — submit-side guarantees from the 2026-05-24 fix.
 *
 * Two behaviors that prevent silent foot-guns:
 *   1. Each submit generates a fresh Idempotency-Key. The backend's
 *      gift endpoint dedupes on that header, so a double-click must
 *      collapse to one transaction rather than two.
 *   2. When the dialog is opened with a `prefilledRecipient`, the
 *      input is locked so the friend can't be retargeted on a typo.
 *
 * NOT worth testing here:
 *   - The walletStore update on success — covered by walletStore unit
 *     tests + the GiftDialog success branch which is essentially a
 *     setBalance pass-through.
 *   - The Modal chrome (close button, backdrop) — covered by Modal tests.
 */
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";

import { GiftDialog } from "@/components/profile/wallet/GiftDialog";
import { useWalletStore } from "@/lib/state/walletStore";
import { server } from "@/tests/setup";

const BASE = "http://localhost:8000";

beforeEach(() => {
  useWalletStore.setState({ byCurrency: { T: 10_000 } });
});

afterEach(() => {
  vi.clearAllMocks();
});

test("submitting the form attaches a fresh Idempotency-Key header", async () => {
  const captured: string[] = [];
  server.use(
    http.post(`${BASE}/api/v1/me/wallet/gift`, ({ request }) => {
      const key = request.headers.get("Idempotency-Key");
      if (key) captured.push(key);
      return HttpResponse.json({
        transaction_id: "t-1",
        balance_after_minor: 9_000,
        amount_minor: 1_000,
        recipient_user_id: "u-bob",
      });
    }),
  );

  render(
    <GiftDialog
      open
      onClose={vi.fn()}
      prefilledRecipient="u-bob"
    />,
  );

  // Just fire the submit button — the form already has the recipient
  // pre-filled and "10" as the default amount.
  fireEvent.click(screen.getByText(/submitCta/i));

  await waitFor(() => {
    expect(captured.length).toBe(1);
  });
  // Key shape is non-empty and reasonably unique-looking (UUID or our
  // fallback `gift-${ts}-${rnd}` form).
  expect(captured[0]).toMatch(/^[0-9a-f-]{16,}|gift-[a-z0-9-]+/);
});

test("prefilledRecipient locks the input so a friend can't be retargeted by typing", () => {
  render(
    <GiftDialog
      open
      onClose={vi.fn()}
      prefilledRecipient="u-bob"
    />,
  );

  const dialog = screen.getByTestId("wallet-gift-dialog");
  const input = dialog.querySelector("input") as HTMLInputElement;
  expect(input.value).toBe("u-bob");
  expect(input).toHaveAttribute("readonly");
});

test("no prefilledRecipient keeps the input editable (manual-entry path)", () => {
  // The legacy entry from WalletActions still works — the user pastes
  // a citizen ID and the input is editable.
  render(<GiftDialog open onClose={vi.fn()} />);

  const dialog = screen.getByTestId("wallet-gift-dialog");
  const input = dialog.querySelector("input") as HTMLInputElement;
  expect(input.value).toBe("");
  expect(input).not.toHaveAttribute("readonly");
});

test("422 from the server surfaces the amount error branch", async () => {
  server.use(
    http.post(`${BASE}/api/v1/me/wallet/gift`, () =>
      HttpResponse.json({ message: "invalid_amount" }, { status: 422 }),
    ),
  );

  render(
    <GiftDialog open onClose={vi.fn()} prefilledRecipient="u-bob" />,
  );

  fireEvent.click(screen.getByText(/submitCta/i));

  // i18n stub maps the namespaced error key to a literal string we can
  // probe for; the dialog stays open with the error visible.
  await waitFor(() => {
    expect(
      screen.getByText(/profile\.wallet\.gift\.errorAmount/),
    ).toBeInTheDocument();
  });
});
