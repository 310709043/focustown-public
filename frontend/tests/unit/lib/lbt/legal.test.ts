/**
 * Legal facts — the numbers the policy pages and the guide state come from
 * LBT_LEGAL alone, so changing a retention period changes every page.
 */
import { expect, test } from "vitest";

import zh from "@/messages/zh-TW/lbt.json";
import en from "@/messages/en/lbt.json";
import { fillLegalFacts, LBT_LEGAL, policySections } from "@/lib/lbt/legal";
import { POND_OFFER, POND_ON_SALE, POND_PURCHASE_URL } from "@/lib/lbt/pond";

test("fills every known placeholder from LBT_LEGAL", () => {
  const out = fillLegalFacts("{reportDays}/{pairBlockHours}/{tokenHours}/{feedbackDays}/{suspensionHours}/{suspensionDays}");
  expect(out).toBe(
    `${LBT_LEGAL.reportDays}/${LBT_LEGAL.pairBlockHours}/${LBT_LEGAL.tokenHours}/${LBT_LEGAL.feedbackDays}/${LBT_LEGAL.suspensionHours}/${LBT_LEGAL.suspensionDays}`,
  );
});

test("leaves unknown placeholders untouched", () => {
  expect(fillLegalFacts("{nope} stays")).toBe("{nope} stays");
});

test.each([
  ["zh-TW", zh],
  ["en", en],
])("%s guide states retention through placeholders, not literals", (_locale, messages) => {
  const answers = messages.guide.questions.map((q) => q.a).join("\n");
  expect(answers).not.toContain("{chatHours}");
  expect(answers).toContain(_locale === "zh-TW" ? "立即刪除" : "immediately deletes");
  expect(answers).toContain("{reportDays}");
  expect(answers).toContain("{pairBlockHours}");
  expect(answers).not.toMatch(/\b180\b/);
  expect(fillLegalFacts(answers)).not.toMatch(/\{(chatHours|reportDays|pairBlockHours)\}/);
});

test.each([
  ["zh-TW", zh],
  ["en", en],
])("%s guide keeps a crisis resource in view", (_locale, messages) => {
  const answers = messages.guide.questions.map((q) => q.a).join("\n");
  expect(answers).toContain("findahelpline.com");
});

test.each([
  ["zh-TW", zh],
  ["en", en],
])("%s policy pages state retention and the pair block only through placeholders", (_locale, messages) => {
  const text = (["privacy", "terms", "guidelines"] as const)
    .flatMap((slug) => messages.policy[slug].sections.flatMap((s) => s.p))
    .join("\n");
  expect(text).not.toMatch(/\b(24|180)\b/);
  expect(text).toContain("{pairBlockHours}");
});

test("the koi pond facts come from POND_OFFER", () => {
  expect(fillLegalFacts("{pondPrice}/{pondDevices}/{pondCodeHours}/{pondRefundDays}")).toBe(
    `${POND_OFFER.priceUsd}/${POND_OFFER.devices}/${POND_OFFER.codeHours}/${POND_OFFER.refundDays}`,
  );
});

test("sections marked pond appear only while the pond is on sale", () => {
  const sections = [{ h: "a" }, { h: "pond", pond: true }, { h: "b" }];
  expect(policySections(sections, false).map((s) => s.h)).toEqual(["a", "b"]);
  expect(policySections(sections, true).map((s) => s.h)).toEqual(["a", "pond", "b"]);
});

test("the pond goes on sale only with a Buy Me a Coffee link", () => {
  expect(POND_ON_SALE).toBe(POND_PURCHASE_URL !== null);
  if (POND_PURCHASE_URL !== null) expect(new URL(POND_PURCHASE_URL).hostname).toBe("buymeacoffee.com");
});

test.each([
  ["zh-TW", zh],
  ["en", en],
])("%s terms and privacy each describe the pond, with its numbers as placeholders", (_locale, messages) => {
  for (const slug of ["terms", "privacy"] as const) {
    const pond = messages.policy[slug].sections.filter((s) => "pond" in s && s.pond);
    expect(pond).toHaveLength(1);
  }
  const terms = messages.policy.terms.sections
    .filter((s) => "pond" in s && s.pond)
    .flatMap((s) => s.p)
    .join("\n");
  for (const fact of ["{pondPrice}", "{pondDevices}", "{pondCodeHours}", "{pondRefundDays}"]) {
    expect(terms).toContain(fact);
  }
  expect(terms).not.toMatch(new RegExp(`\\b${POND_OFFER.priceUsd}\\b`));
});
