/**
 * getCheckoutUrl — the single gate between the "light a lamp" buttons and a
 * payment page. Payment must stay off until approved links exist, and only
 * https links may ever be opened.
 */
import { expect, test } from "vitest";

import { SUPPORT_AMOUNTS } from "@/lib/lbt/constants";
import {
  SUPPORT_CHECKOUT_LINKS,
  getCheckoutUrl,
  isSupportAmount,
} from "@/lib/lbt/support";
import type { SupportAmount } from "@/lib/lbt/types";

const links = (overrides: Partial<Record<SupportAmount, string>> = {}) => ({
  60: "",
  150: "",
  300: "",
  ...overrides,
});

test.each(SUPPORT_AMOUNTS)("shipped config leaves NT$%i disabled", (amount) => {
  expect(getCheckoutUrl(amount)).toBeNull();
});

test("shipped config holds no link at all", () => {
  expect(Object.values(SUPPORT_CHECKOUT_LINKS)).toEqual(["", "", ""]);
});

test("an https link is returned for its own amount", () => {
  const result = getCheckoutUrl(150, links({ 150: "https://pay.example.com/c/150" }));

  expect(result).toBe("https://pay.example.com/c/150");
});

test("a link configured for one amount does not enable the others", () => {
  const result = getCheckoutUrl(60, links({ 150: "https://pay.example.com/c/150" }));

  expect(result).toBeNull();
});

test.each([
  ["http", "http://pay.example.com/c/60"],
  ["javascript", "javascript:alert(1)"],
  ["data", "data:text/html,<script>alert(1)</script>"],
  ["malformed", "not a url"],
])("a %s link is rejected", (_label, link) => {
  expect(getCheckoutUrl(60, links({ 60: link }))).toBeNull();
});

test.each([
  [60, true],
  [150, true],
  [300, true],
  [100, false],
  [0, false],
  [-60, false],
  [Number.NaN, false],
])("isSupportAmount(%s) is %s", (value, expected) => {
  expect(isSupportAmount(value)).toBe(expected);
});
