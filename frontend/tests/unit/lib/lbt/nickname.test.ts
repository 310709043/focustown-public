/**
 * normalizeNickname — what the visitor typed becomes the name shown to the
 * other person. Categories: logic (trim / fallback), boundary (12-char cap,
 * code points), error-ish input (control characters, whitespace only).
 */
import { expect, test } from "vitest";

import { NICKNAME_MAX } from "@/lib/lbt/constants";
import { normalizeNickname } from "@/lib/lbt/nickname";

const FALLBACK = "晚風旅人";

test.each([
  ["typical name is kept", "小橘", "小橘"],
  ["surrounding spaces are trimmed", "  小橘  ", "小橘"],
  ["empty input falls back", "", FALLBACK],
  ["whitespace-only input falls back", "   \t ", FALLBACK],
  ["control characters are stripped", "小\u0000橘\n", "小橘"],
  ["only control characters falls back", "\u0001\u0002", FALLBACK],
])("%s", (_label, raw, expected) => {
  expect(normalizeNickname(raw, FALLBACK)).toBe(expected);
});

test("a name of exactly the maximum length is untouched", () => {
  const exact = "一".repeat(NICKNAME_MAX);

  expect(normalizeNickname(exact, FALLBACK)).toBe(exact);
});

test("a name one character over the maximum is cut to the maximum", () => {
  const over = "一".repeat(NICKNAME_MAX + 1);

  expect(normalizeNickname(over, FALLBACK)).toBe("一".repeat(NICKNAME_MAX));
});

test("an emoji at the cut point is never split in half", () => {
  const raw = `${"a".repeat(NICKNAME_MAX - 1)}🌙🌙`;

  expect(normalizeNickname(raw, FALLBACK)).toBe(`${"a".repeat(NICKNAME_MAX - 1)}🌙`);
});

test("trailing space left by the cut is trimmed", () => {
  const raw = `${"a".repeat(NICKNAME_MAX - 1)} b`;

  expect(normalizeNickname(raw, FALLBACK)).toBe("a".repeat(NICKNAME_MAX - 1));
});
