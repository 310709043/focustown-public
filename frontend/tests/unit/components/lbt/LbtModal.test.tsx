/**
 * LbtModal — accessible dialog shell.
 * Worth testing: focus moves in, Tab/Shift+Tab stay inside (radio groups are
 * one tab stop), Escape/backdrop close, focus returns to the opener,
 * disabled confirm does nothing.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";

import { LbtModal } from "@/components/lbt/LbtModal";

function Harness({
  onClose = vi.fn(),
  onConfirm = vi.fn(),
  confirmDisabled = false,
  withRadios = false,
  secondary,
}: {
  onClose?: () => void;
  onConfirm?: () => void;
  confirmDisabled?: boolean;
  withRadios?: boolean;
  secondary?: { label: string; onClick: () => void };
}) {
  return (
    <LbtModal
      eyebrow="eyebrow"
      title="Dialog title"
      confirmLabel="Confirm"
      confirmDisabled={confirmDisabled}
      onConfirm={onConfirm}
      secondaryLabel={secondary?.label}
      onSecondary={secondary?.onClick}
      onClose={onClose}
    >
      {withRadios ? (
        <fieldset>
          <input type="radio" name="amount" value="1" defaultChecked aria-label="one" />
          <input type="radio" name="amount" value="2" aria-label="two" />
          <input type="radio" name="amount" value="3" aria-label="three" />
        </fieldset>
      ) : (
        <p>body</p>
      )}
    </LbtModal>
  );
}

describe("focus", () => {
  test("moves to the close button on open", () => {
    render(<Harness />);

    expect(screen.getByRole("button", { name: "lbt.modal.close" })).toHaveFocus();
  });

  test("Tab from the last control wraps to the first", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    screen.getByRole("button", { name: "Confirm" }).focus();

    await user.tab();

    expect(screen.getByRole("button", { name: "lbt.modal.close" })).toHaveFocus();
  });

  test("Shift+Tab from the first control wraps to the last", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.tab({ shift: true });

    expect(screen.getByRole("button", { name: "Confirm" })).toHaveFocus();
  });

  test("a radio group counts as one tab stop, so Tab from the checked radio reaches confirm", async () => {
    const user = userEvent.setup();
    render(<Harness withRadios />);
    screen.getByRole("radio", { name: "one" }).focus();

    await user.tab();

    expect(screen.getByRole("button", { name: "Confirm" })).toHaveFocus();
  });

  test("when confirm is disabled the checked radio is the last tab stop and wraps to close", async () => {
    const user = userEvent.setup();
    render(<Harness withRadios confirmDisabled />);
    screen.getByRole("radio", { name: "one" }).focus();

    await user.tab();

    expect(screen.getByRole("button", { name: "lbt.modal.close" })).toHaveFocus();
  });

  test("focus returns to the opener when the dialog unmounts", () => {
    function Page() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>opener</button>
          {open ? <Harness onClose={() => setOpen(false)} /> : null}
        </>
      );
    }
    render(<Page />);
    const opener = screen.getByRole("button", { name: "opener" });
    opener.focus();
    fireEvent.click(opener);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(opener).toHaveFocus();
  });
});

describe("closing", () => {
  test("Escape calls onClose once", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("clicking the close button calls onClose", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "lbt.modal.close" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("clicking the backdrop calls onClose", () => {
    const onClose = vi.fn();
    const { container } = render(<Harness onClose={onClose} />);

    fireEvent.click(container.querySelector(".modal-backdrop") as HTMLElement);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("clicking inside the dialog does not close it", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);

    fireEvent.click(screen.getByText("body"));

    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("actions", () => {
  test("confirm calls onConfirm", () => {
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  test("a disabled confirm cannot be activated", () => {
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} confirmDisabled />);

    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    expect(onConfirm).not.toHaveBeenCalled();
  });

  test("the secondary action appears and fires when provided", () => {
    const onClick = vi.fn();
    render(<Harness secondary={{ label: "Leave", onClick }} />);

    fireEvent.click(screen.getByRole("button", { name: "Leave" }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test("no secondary button is rendered without one", () => {
    render(<Harness />);

    expect(screen.queryByRole("button", { name: "Leave" })).toBeNull();
  });

  test("the dialog is labelled by its title", () => {
    render(<Harness />);

    expect(screen.getByRole("dialog", { name: "Dialog title" })).toBeInTheDocument();
  });
});
