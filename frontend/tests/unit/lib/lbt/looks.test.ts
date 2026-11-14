/**
 * Paid looks: only owned looks switch on, an owned look is on until the
 * visitor turns it off, the dev preview shows a look without owning it, and
 * nothing is on sale until the Buy Me a Coffee link is set.
 */
import { describe, expect, test } from "vitest";

import { effectiveLooks } from "@/lib/lbt/looks";
import { LOOKS_ON_SALE, LOOKS_PURCHASE_URL } from "@/lib/lbt/looksOffer";

const none = { style: null, rain: null };
const noPreview = { style: null, rain: false };

describe("effectiveLooks", () => {
  test("a visitor who owns nothing sees the original town", () => {
    expect(effectiveLooks([], none, noPreview)).toEqual({ ownsRain: false, ownedStyles: [], rain: false, style: null });
  });

  test("a bought look is on until it is switched off", () => {
    expect(effectiveLooks(["rain-town", "style-mint"], none, noPreview)).toMatchObject({ rain: true, style: "mint" });
    expect(effectiveLooks(["rain-town", "style-mint"], { style: "original", rain: false }, noPreview)).toMatchObject({ rain: false, style: null });
  });

  test("a chosen style must be owned; otherwise the first owned style is on", () => {
    expect(effectiveLooks(["style-sakura", "style-pixel"], { style: "pixel", rain: null }, noPreview).style).toBe("pixel");
    expect(effectiveLooks(["style-sakura"], { style: "pixel", rain: null }, noPreview).style).toBe("sakura");
    expect(effectiveLooks(["koi-pond"], { style: "pixel", rain: true }, noPreview)).toMatchObject({ style: null, rain: false });
  });

  test("the dev preview shows a look without owning it", () => {
    expect(effectiveLooks([], none, { style: "milktea", rain: true })).toMatchObject({ style: "milktea", rain: true, ownedStyles: [] });
  });
});

test("the looks go on sale only with a Buy Me a Coffee link", () => {
  expect(LOOKS_ON_SALE).toBe(LOOKS_PURCHASE_URL !== null);
  if (LOOKS_PURCHASE_URL !== null) expect(new URL(LOOKS_PURCHASE_URL).hostname).toBe("buymeacoffee.com");
});
