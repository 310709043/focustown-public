/**
 * apiFetch — token refresh + retry semantics.
 *
 * Worth testing:
 * - 200 response with no token: returns parsed body, no Authorization header
 * - 200 response with token: Authorization header is attached
 * - 401 with refresh token: refresh is called, request retried once with
 *   new token, returns success
 * - Refresh failure: token store is cleared and an ApiError surfaces
 * - non-401 error: bubbles as ApiError with the server-provided code/message
 *
 * NOT worth testing:
 * - Individual endpoint wrappers — they are one-liners around apiFetch.
 * - 204 No Content — trivial early return.
 */
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ApiError, apiFetch, tokenStore } from "@/lib/api/client";

const TEST_TOKENS = { access_token: "old-access", refresh_token: "refresh-x" };

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

type MockResponse = { status: number; body?: unknown; statusText?: string };

function mockFetchSequence(responses: MockResponse[]) {
  const fetchMock = vi.fn();
  for (const r of responses) {
    fetchMock.mockResolvedValueOnce({
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      statusText: r.statusText ?? "",
      json: async () => r.body,
    } as unknown as Response);
  }
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

test("attaches Authorization header when a token is stored", async () => {
  tokenStore.save(TEST_TOKENS);
  const fetchMock = mockFetchSequence([{ status: 200, body: { ok: true } }]);

  await apiFetch("/api/v1/auth/me");

  const init = fetchMock.mock.calls[0][1] as RequestInit;
  expect((init.headers as Record<string, string>).authorization).toBe(
    "Bearer old-access",
  );
});

test("omits Authorization header when auth=false", async () => {
  tokenStore.save(TEST_TOKENS);
  const fetchMock = mockFetchSequence([{ status: 200, body: { ok: true } }]);

  await apiFetch("/api/v1/auth/signup", { auth: false });

  const init = fetchMock.mock.calls[0][1] as RequestInit;
  expect((init.headers as Record<string, string>).authorization).toBeUndefined();
});

test("on 401 with refresh token, refreshes and retries with new token", async () => {
  tokenStore.save(TEST_TOKENS);
  const fetchMock = mockFetchSequence([
    { status: 401, body: { error: { code: "auth", message: "expired" } } },
    {
      status: 200,
      body: { access_token: "fresh-access", refresh_token: "refresh-x" },
    },
    { status: 200, body: { ok: true } },
  ]);

  const result = await apiFetch<{ ok: boolean }>("/api/v1/auth/me");

  expect(result.ok).toBe(true);
  expect(fetchMock).toHaveBeenCalledTimes(3);
  const retryInit = fetchMock.mock.calls[2][1] as RequestInit;
  expect((retryInit.headers as Record<string, string>).authorization).toBe(
    "Bearer fresh-access",
  );
  // Tokens persisted so the next call starts with the new pair.
  expect(tokenStore.load()?.access_token).toBe("fresh-access");
});

test("on refresh failure, clears tokens and surfaces ApiError", async () => {
  tokenStore.save(TEST_TOKENS);
  mockFetchSequence([
    { status: 401, body: {} },
    { status: 401, body: {} }, // refresh itself fails
    { status: 401, body: { error: { code: "auth", message: "expired" } } },
  ]);

  await expect(apiFetch("/api/v1/auth/me")).rejects.toBeInstanceOf(ApiError);
  expect(tokenStore.load()).toBeNull();
});

test("non-401 error surfaces server code + message", async () => {
  mockFetchSequence([
    {
      status: 422,
      body: { error: { code: "validation_error", message: "bad_input" } },
    },
  ]);

  await expect(apiFetch("/api/v1/auth/signup", { auth: false })).rejects.toMatchObject(
    {
      status: 422,
      code: "validation_error",
      message: "bad_input",
    },
  );
});
