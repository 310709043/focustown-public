/**
 * auth validation — password strength + cross-field rules.
 *
 * Worth testing:
 * - password must have BOTH letter and digit (single-class fails)
 * - too short (7 chars) fails
 * - resetPasswordSchema enforces newPassword === confirmPassword
 * - terms must be accepted on signup
 *
 * NOT worth testing:
 * - That zod accepts a valid email — that's zod's contract.
 * - The Chinese error message strings — copy edits are not regressions.
 */
import { expect, test } from "vitest";
import {
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from "@/lib/validation/auth";

const validSignUp = {
  displayName: "Alice",
  email: "alice@example.com",
  password: "abc12345",
  termsAccepted: true,
  marketingOptIn: false,
};

test("signUp accepts a valid payload", () => {
  expect(signUpSchema.safeParse(validSignUp).success).toBe(true);
});

test("password too short fails", () => {
  const r = signUpSchema.safeParse({ ...validSignUp, password: "abc1234" });
  expect(r.success).toBe(false);
});

test("password without digit fails", () => {
  const r = signUpSchema.safeParse({ ...validSignUp, password: "abcdefgh" });
  expect(r.success).toBe(false);
});

test("password without letter fails", () => {
  const r = signUpSchema.safeParse({ ...validSignUp, password: "12345678" });
  expect(r.success).toBe(false);
});

test("terms must be accepted", () => {
  const r = signUpSchema.safeParse({ ...validSignUp, termsAccepted: false });
  expect(r.success).toBe(false);
});

test("signIn rejects missing password", () => {
  const r = signInSchema.safeParse({ email: "a@b.c", password: "" });
  expect(r.success).toBe(false);
});

test("resetPassword requires matching newPassword + confirmPassword", () => {
  const r = resetPasswordSchema.safeParse({
    token: "a-very-long-reset-token-1234567890",
    newPassword: "abc12345",
    confirmPassword: "different1",
  });
  expect(r.success).toBe(false);
});
