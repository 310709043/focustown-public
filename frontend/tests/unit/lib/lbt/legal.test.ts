/**
 * Legal facts — the numbers the policy pages and the guide state come from
 * LBT_LEGAL alone, so changing a retention period changes every page.
 */
import { expect, test } from "vitest";

import zh from "@/messages/zh-TW/lbt.json";
import en from "@/messages/en/lbt.json";
import { fillLegalFacts, LBT_LEGAL } from "@/lib/lbt/legal";

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
