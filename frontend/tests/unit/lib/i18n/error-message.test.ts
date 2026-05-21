/**
 * lib/i18n/error-message — maps backend error codes + HTTP status to
 * localized strings via the next-intl translator.
 *
 * Worth testing (these rules drive what users see when things break):
 * - ApiError with a known code resolves through the translator dictionary
 * - ApiError with an UNKNOWN code falls back by status family:
 *     - 0 (no response) → generic.network
 *     - 401/403         → generic.unauthorized
 *     - 5xx             → generic.server
 *     - anything else   → generic.unknown
 * - TypeError (browser network failure) → generic.network
 * - Random Error / non-Error values → generic.unknown
 */
import { expect, test } from "vitest";

import { ApiError } from "@/lib/api/client";
import { getErrorMessage } from "@/lib/i18n/error-message";

/** Stub translator: returns the key unchanged unless it's in the dictionary. */
function makeT(dict: Record<string, string> = {}): (key: string) => string {
  return (key: string) => dict[key] ?? key;
}

test("ApiError with a known code returns the dictionary translation", () => {
  const err = new ApiError("raw_backend_msg", 401, "invalid_credentials");
  const t = makeT({ invalid_credentials: "帳號或密碼錯誤" });

  expect(getErrorMessage(err, t)).toBe("帳號或密碼錯誤");
});

test("ApiError with an unknown code + status 0 falls back to generic.network", () => {
  const err = new ApiError("x", 0, "weird_synthetic_code");
  const t = makeT({ "generic.network": "網路連線失敗" });

  expect(getErrorMessage(err, t)).toBe("網路連線失敗");
});

test("ApiError with an unknown code + 401 falls back to generic.unauthorized", () => {
  const err = new ApiError("x", 401, "weird");
  const t = makeT({ "generic.unauthorized": "請重新登入" });

  expect(getErrorMessage(err, t)).toBe("請重新登入");
});

test("ApiError with an unknown code + 403 also falls back to generic.unauthorized", () => {
  const err = new ApiError("x", 403, "weird");
  const t = makeT({ "generic.unauthorized": "請重新登入" });

  expect(getErrorMessage(err, t)).toBe("請重新登入");
});

test("ApiError with an unknown code + 500 falls back to generic.server", () => {
  const err = new ApiError("x", 500, "weird");
  const t = makeT({ "generic.server": "伺服器忙線中" });

  expect(getErrorMessage(err, t)).toBe("伺服器忙線中");
});

test("ApiError with an unknown code + 400 falls back to generic.unknown", () => {
  const err = new ApiError("x", 400, "weird");
  const t = makeT({ "generic.unknown": "未知錯誤" });

  expect(getErrorMessage(err, t)).toBe("未知錯誤");
});

test("TypeError (browser fetch failure) returns generic.network", () => {
  const t = makeT({ "generic.network": "網路連線失敗" });

  expect(getErrorMessage(new TypeError("Failed to fetch"), t)).toBe(
    "網路連線失敗",
  );
});

test("Plain Error returns generic.unknown", () => {
  const t = makeT({ "generic.unknown": "未知錯誤" });

  expect(getErrorMessage(new Error("anything"), t)).toBe("未知錯誤");
});

test("Non-Error value returns generic.unknown", () => {
  const t = makeT({ "generic.unknown": "未知錯誤" });

  expect(getErrorMessage("string thrown", t)).toBe("未知錯誤");
});
