/**
 * FeedbackModal — three categories, a required message, an optional e-mail,
 * a honeypot that stays out of reach, and clear outcomes for success and
 * failure.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { FeedbackModal } from "@/components/lbt/FeedbackModal";
import { FeedbackError, submitFeedback } from "@/lib/lbt/feedback";
import { useLbtStore } from "@/lib/lbt/sessionStore";

vi.mock("@/lib/lbt/feedback", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/lbt/feedback")>()),
  submitFeedback: vi.fn(async () => "f1"),
}));

const mockedSubmit = vi.mocked(submitFeedback);
const SUBMIT = "lbt.modal.feedback.submit";

beforeEach(() => {
  useLbtStore.getState().reset();
  useLbtStore.getState().openModal({ type: "feedback" });
  mockedSubmit.mockReset();
  mockedSubmit.mockResolvedValue("f1");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("form", () => {
  test("offers the three categories, starting on idea", () => {
    render(<FeedbackModal />);
    const radios = screen.getAllByRole("radio") as HTMLInputElement[];
    expect(radios.map((r) => r.value)).toEqual(["idea", "bug", "other"]);
    expect(radios[0]).toBeChecked();
  });

  test("the honeypot is hidden from assistive tech and keyboard", () => {
    const { container } = render(<FeedbackModal />);
    const hp = container.querySelector<HTMLInputElement>('input[name="website"]');
    expect(hp).not.toBeNull();
    expect(hp?.tabIndex).toBe(-1);
    expect(hp?.closest("label")).toHaveAttribute("aria-hidden", "true");
  });

  test("an empty message is not sent", () => {
    render(<FeedbackModal />);
    fireEvent.click(screen.getByRole("button", { name: SUBMIT }));
    expect(mockedSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("lbt.modal.feedback.errors.invalid_message");
  });
});

describe("sending", () => {
  test("sends the category, message, e-mail, page and locale", async () => {
    render(<FeedbackModal />);
    fireEvent.click(screen.getByRole("radio", { name: "lbt.modal.feedback.categories.bug" }));
    fireEvent.change(screen.getByLabelText("lbt.modal.feedback.messageLabel"), { target: { value: "按鈕沒反應" } });
    fireEvent.change(screen.getByLabelText("lbt.modal.feedback.emailLabel"), { target: { value: "me@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: SUBMIT }));

    await screen.findByText("lbt.modal.feedback.sentBodyEmail");
    expect(mockedSubmit).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        category: "bug",
        message: "按鈕沒反應",
        email: "me@example.com",
        website: "",
        locale: "zh-TW",
        page: window.location.pathname,
      }),
    );
  });

  test("without an e-mail the thank-you does not promise a reply", async () => {
    render(<FeedbackModal />);
    fireEvent.change(screen.getByLabelText("lbt.modal.feedback.messageLabel"), { target: { value: "很喜歡" } });
    fireEvent.click(screen.getByRole("button", { name: SUBMIT }));
    expect(await screen.findByText("lbt.modal.feedback.sentBody")).toBeInTheDocument();
  });

  test("a failure keeps the text and shows the reason", async () => {
    mockedSubmit.mockRejectedValue(new FeedbackError("too_many_feedback"));
    render(<FeedbackModal />);
    const box = screen.getByLabelText("lbt.modal.feedback.messageLabel");
    fireEvent.change(box, { target: { value: "再一則" } });
    fireEvent.click(screen.getByRole("button", { name: SUBMIT }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("lbt.modal.feedback.errors.too_many_feedback"),
    );
    expect(box).toHaveValue("再一則");
  });
});
