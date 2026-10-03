/**
 * SupportModal — "light a lamp" single-payment tiers.
 * The promises under test: three fixed amounts, one-time wording, payment
 * stays disabled without an approved link, and a link opens in a new tab
 * without referrer/opener access.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { SupportModal } from "@/components/lbt/SupportModal";
import { useLbtStore } from "@/lib/lbt/sessionStore";
import { getCheckoutUrl } from "@/lib/lbt/support";

vi.mock("@/lib/lbt/support", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/lbt/support")>()),
  getCheckoutUrl: vi.fn(() => null),
}));

const mockedGetCheckoutUrl = vi.mocked(getCheckoutUrl);

beforeEach(() => {
  useLbtStore.getState().reset();
  useLbtStore.getState().openModal({ type: "support" });
  mockedGetCheckoutUrl.mockReturnValue(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("amounts", () => {
  test("offers exactly three fixed amounts", () => {
    render(<SupportModal />);

    expect(screen.getAllByRole("radio").map((r) => (r as HTMLInputElement).value)).toEqual([
      "60",
      "150",
      "300",
    ]);
  });

  test("starts on NT$60", () => {
    render(<SupportModal />);

    expect(screen.getByRole("radio", { name: "NT$60" })).toBeChecked();
  });

  test("the total follows the chosen amount", () => {
    render(<SupportModal />);

    fireEvent.click(screen.getByRole("radio", { name: "NT$300" }));

    expect(screen.getByText("NT$300", { selector: "strong" })).toBeInTheDocument();
  });
});

describe("payment switched off", () => {
  test("the confirm button is disabled and says payment is not open", () => {
    render(<SupportModal />);

    expect(
      screen.getByRole("button", { name: /lbt\.modal\.support\.unavailable/ }),
    ).toBeDisabled();
  });

  test("the disclosure states that no payment details are collected", () => {
    render(<SupportModal />);

    expect(screen.getByText("lbt.modal.support.disclosure")).toBeInTheDocument();
  });

  test("the one-time, no-renewal wording is on screen", () => {
    render(<SupportModal />);

    expect(screen.getByText("lbt.modal.support.once")).toBeInTheDocument();
  });

  test("no window is opened", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    render(<SupportModal />);

    fireEvent.click(screen.getByRole("button", { name: /unavailable/ }));

    expect(open).not.toHaveBeenCalled();
  });
});

describe("payment switched on", () => {
  test("the confirm button is enabled and names the amount", () => {
    mockedGetCheckoutUrl.mockReturnValue("https://pay.example.com/c/60");
    render(<SupportModal />);

    expect(
      screen.getByRole("button", {
        name: /lbt\.modal\.support\.checkout\(\{"amount":"NT\$60"\}\)/,
      }),
    ).toBeEnabled();
  });

  test("confirming opens the link in a new tab without opener access", () => {
    mockedGetCheckoutUrl.mockReturnValue("https://pay.example.com/c/60");
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    render(<SupportModal />);

    fireEvent.click(screen.getByRole("button", { name: /checkout/ }));

    expect(open).toHaveBeenCalledWith(
      "https://pay.example.com/c/60",
      "_blank",
      "noopener,noreferrer",
    );
  });

  test("confirming closes the dialog", () => {
    mockedGetCheckoutUrl.mockReturnValue("https://pay.example.com/c/60");
    vi.spyOn(window, "open").mockReturnValue(null);
    render(<SupportModal />);

    fireEvent.click(screen.getByRole("button", { name: /checkout/ }));

    expect(useLbtStore.getState().modal).toBeNull();
  });
});

test("closing with Escape clears the store's modal", () => {
  render(<SupportModal />);

  fireEvent.keyDown(document, { key: "Escape" });

  expect(useLbtStore.getState().modal).toBeNull();
});
