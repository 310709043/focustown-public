import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { SupportModal } from "@/components/lbt/SupportModal";
import { useLbtStore } from "@/lib/lbt/sessionStore";
import { SUPPORT_PAGE_URL, SUPPORT_REFUND_URL } from "@/lib/lbt/support";

beforeEach(() => {
  useLbtStore.getState().reset();
  useLbtStore.getState().openModal({ type: "support" });
});
afterEach(() => vi.restoreAllMocks());

test("shows USD pricing and disclosures without obsolete TWD tiers", () => {
  render(<SupportModal />);
  expect(screen.getByText("1 Power · US$5")).toBeInTheDocument();
  expect(screen.queryAllByRole("radio")).toHaveLength(0);
  expect(screen.getByText("lbt.modal.support.once")).toBeInTheDocument();
  expect(screen.getByText("lbt.modal.support.disclosure")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "lbt.modal.support.refundLink" })).toHaveAttribute("href", SUPPORT_REFUND_URL);
});

test("opens the owner's support page without opener access, then closes the modal", () => {
  const open = vi.spyOn(window, "open").mockReturnValue(null);
  render(<SupportModal />);
  fireEvent.click(screen.getByRole("button", { name: "lbt.modal.support.checkout" }));
  expect(open).toHaveBeenCalledWith(SUPPORT_PAGE_URL, "_blank", "noopener,noreferrer");
  expect(useLbtStore.getState().modal).toBeNull();
});

test("closing the dialog does not open a payment page", () => {
  const open = vi.spyOn(window, "open").mockReturnValue(null);
  render(<SupportModal />);
  fireEvent.keyDown(document, { key: "Escape" });
  expect(useLbtStore.getState().modal).toBeNull();
  expect(open).not.toHaveBeenCalled();
});
