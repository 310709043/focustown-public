import { expect, test } from "vitest";
import { sanitizeReturnTo } from "@/lib/routing/safeReturnTo";

test("accepts a single-slash internal path", () => {
  expect(sanitizeReturnTo("/u/abc-123")).toBe("/u/abc-123");
});

test("rejects null and empty", () => {
  expect(sanitizeReturnTo(null)).toBeNull();
  expect(sanitizeReturnTo("")).toBeNull();
  expect(sanitizeReturnTo(undefined)).toBeNull();
});

test("rejects protocol-relative paths (open-redirect vector)", () => {
  expect(sanitizeReturnTo("//attacker.example")).toBeNull();
  expect(sanitizeReturnTo("//attacker.example/path")).toBeNull();
});

test("rejects absolute URLs", () => {
  expect(sanitizeReturnTo("https://attacker.example")).toBeNull();
  expect(sanitizeReturnTo("http://attacker.example/path")).toBeNull();
});

test("rejects relative paths without leading slash", () => {
  expect(sanitizeReturnTo("u/abc")).toBeNull();
  expect(sanitizeReturnTo("../town")).toBeNull();
});
