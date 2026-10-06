/**
 * Guide articles: every slug has copy in both languages with the same shape,
 * the numbers come from the legal facts, and the pages that touch hard nights
 * or strangers keep the crisis lines and the 18+ rule in view.
 */
import { describe, expect, test } from "vitest";

import en from "@/messages/en/lbt.json";
import zhTW from "@/messages/zh-TW/lbt.json";
import { ARTICLE_SLUGS, type ArticleCopy, findArticle } from "@/lib/lbt/articles";
import { fillLegalFacts } from "@/lib/lbt/legal";

const bundles = [
  ["zh-TW", zhTW.articles.items as Record<string, ArticleCopy>],
  ["en", en.articles.items as Record<string, ArticleCopy>],
] as const;

const text = (copy: ArticleCopy) =>
  [copy.intro, ...copy.sections.flatMap((s) => [s.h, ...(s.p ?? []), ...(s.li ?? [])])].join("\n");

describe("guide articles", () => {
  test("the registry and both bundles list the same slugs", () => {
    for (const [, items] of bundles) expect(Object.keys(items).sort()).toEqual([...ARTICLE_SLUGS].sort());
    expect(findArticle("nope")).toBeUndefined();
  });

  test.each(bundles)("%s: titles and descriptions fit search results; sections match the other language", (_locale, items) => {
    for (const slug of ARTICLE_SLUGS) {
      const copy = items[slug];
      expect(copy.title.length).toBeGreaterThan(10);
      expect(copy.description.length).toBeGreaterThan(50);
      expect(copy.description.length).toBeLessThanOrEqual(200);
      const other = (_locale === "en" ? zhTW : en).articles.items[slug] as ArticleCopy;
      expect(copy.sections.map((s) => [!!s.p, s.p?.length, !!s.li, s.li?.length])).toEqual(
        other.sections.map((s) => [!!s.p, s.p?.length, !!s.li, s.li?.length]),
      );
      for (const section of copy.sections) expect(section.p ?? section.li).toBeTruthy();
    }
  });

  test.each(bundles)("%s: retention numbers are placeholders, filled from the legal facts", (_locale, items) => {
    const safety = text(items["anonymous-chat-safety"]);
    expect(safety).toContain("{reportDays}");
    expect(safety).toContain("{pairBlockHours}");
    expect(fillLegalFacts(safety)).not.toMatch(/\{\w+\}/);
  });

  test.each(bundles)("%s: a crisis resource and 18+ stay in view", (_locale, items) => {
    for (const slug of ARTICLE_SLUGS) {
      const body = text(items[slug]);
      expect(body).toContain("findahelpline.com");
      expect(body).toMatch(/18/);
    }
  });
});
