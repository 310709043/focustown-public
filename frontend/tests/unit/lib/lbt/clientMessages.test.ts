/**
 * The browser gets only what client components read: the LowBatteryTown
 * strings without the long server-rendered copy, plus the error page.
 */
import { describe, expect, test } from "vitest";

import { lbtClientMessages } from "@/lib/lbt/clientMessages";
import en from "@/messages/en/lbt.json";
import errors from "@/messages/en/errors.json";
import town from "@/messages/en/town.json";

const full = { lbt: en, errors, town };

describe("lbtClientMessages", () => {
  const picked = lbtClientMessages(full) as { lbt: Record<string, unknown> } & Record<string, unknown>;

  test("drops the legacy Focus Town bundles and keeps the error page", () => {
    expect(Object.keys(picked).sort()).toEqual(["errors", "lbt"]);
  });

  test("drops the article bodies, the policy sections and the guide answers", () => {
    const { items: _items, ...labels } = en.articles;
    expect(picked.lbt.articles).toEqual(labels);
    expect(labels).toHaveProperty("wootalkLink");
    expect(picked.lbt.policy).toEqual({ nav: en.policy.nav });
    expect(picked.lbt.guide).toEqual({ nav: en.guide.nav });
  });

  test("keeps everything the app screens read", () => {
    for (const key of ["home", "chat", "waiting", "end", "modal", "notFound", "unlock", "looks"]) {
      expect(picked.lbt[key]).toEqual((en as Record<string, unknown>)[key]);
    }
  });

  test("is much smaller than the full set", () => {
    expect(JSON.stringify(picked).length).toBeLessThan(JSON.stringify(full).length * 0.6);
  });

  test("does not change the input", () => {
    lbtClientMessages(full);
    expect(full.lbt.articles).toBe(en.articles);
  });
});
