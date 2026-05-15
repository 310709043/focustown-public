/**
 * Integration: SignIn page → API → store → router.push.
 *
 * Renders the actual <SignInPage /> with the real authStore + real apiFetch;
 * only the network layer (MSW) and `next/navigation` are stubbed. A failure
 * here means the auth code path that ships in production is broken end-to-
 * end, not a single component bug.
 */
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import SignInPage from "@/app/signin/page";
import { tokenStore } from "@/lib/api/client";
import { useAuthStore } from "@/lib/state/authStore";
import { makeUser } from "../fixtures/factories";
import { server } from "../setup";

const pushSpy = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushSpy,
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

const BASE = "http://localhost:8000";

beforeEach(() => {
  pushSpy.mockReset();
  useAuthStore.setState({ user: null, loading: false, error: null });
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("successful sign in stores tokens and navigates to /town", async () => {
  const user = userEvent.setup();
  render(<SignInPage />);

  await user.type(screen.getByPlaceholderText("email"), "alice@example.com");
  await user.type(screen.getByPlaceholderText("密碼"), "valid-password-1");
  await user.click(screen.getByRole("button", { name: /進入小鎮/ }));

  await vi.waitFor(() => expect(pushSpy).toHaveBeenCalledWith("/town"));
  expect(tokenStore.load()).toEqual({ access_token: "a", refresh_token: "r" });
  expect(useAuthStore.getState().user?.email).toBe(makeUser().email);
});

test("invalid credentials surface error envelope, no navigation", async () => {
  server.use(
    http.post(`${BASE}/api/v1/auth/signin`, () =>
      HttpResponse.json(
        { error: { code: "unauthorized", message: "invalid_credentials" } },
        { status: 401 },
      ),
    ),
  );

  const user = userEvent.setup();
  render(<SignInPage />);

  await user.type(screen.getByPlaceholderText("email"), "alice@example.com");
  await user.type(screen.getByPlaceholderText("密碼"), "wrong-password-1");
  await user.click(screen.getByRole("button", { name: /進入小鎮/ }));

  // role="alert" wraps the error envelope copy.
  expect(await screen.findByRole("alert")).toHaveTextContent("invalid_credentials");
  expect(pushSpy).not.toHaveBeenCalled();
});
