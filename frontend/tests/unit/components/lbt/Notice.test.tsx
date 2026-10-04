import { render, screen } from "@testing-library/react";
import { beforeEach, expect, test } from "vitest";

import { Notice } from "@/components/lbt/Notice";
import { useLbtStore } from "@/lib/lbt/sessionStore";

beforeEach(() => useLbtStore.getState().reset());

test("shows the suspension notice instead of a generic error", () => {
  useLbtStore.setState({ notice: "guest_suspended" });
  render(<Notice />);
  expect(screen.getByRole("alert")).toHaveTextContent("lbt.notice.guest_suspended");
});
