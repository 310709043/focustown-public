/**
 * lib/api/report — surface API failures into the global toaster + shape
 * exceptions for structured logs.
 *
 * Worth testing:
 * - reportApiError pushes a toast through useToastStore with kind=error
 * - errShape captures (code, status) for ApiError, (name) for Error, (name=typeof) otherwise
 */
import { beforeEach, expect, test } from "vitest";

import { ApiError } from "@/lib/api/client";
import { errShape, reportApiError } from "@/lib/api/report";
import { useToastStore } from "@/lib/state/toastStore";

beforeEach(() => {
  useToastStore.setState({ toasts: [] });
});

const t = (key: string) => key;

test("reportApiError funnels into useToastStore with kind=error", () => {
  reportApiError(new ApiError("boom", 500, "internal_error"), t);

  const toasts = useToastStore.getState().toasts;
  expect(toasts).toHaveLength(1);
  expect(toasts[0].kind).toBe("error");
});

test("errShape on ApiError returns code + status", () => {
  expect(errShape(new ApiError("x", 404, "not_found"))).toEqual({
    code: "not_found",
    status: 404,
  });
});

test("errShape on Error returns the name", () => {
  expect(errShape(new TypeError("Failed to fetch"))).toEqual({
    name: "TypeError",
  });
});

test("errShape on non-Error falls back to typeof", () => {
  expect(errShape("string thrown")).toEqual({ name: "string" });
});
