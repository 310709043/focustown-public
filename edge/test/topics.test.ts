/**
 * Sky topics: the trends feed is parsed and filtered for heavy words, the
 * public list is honest about each word's source and never empty, and the
 * owner can add, hide and delete words from /admin.
 */
import { SELF } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, test } from "vitest";

import { IDEA_WORDS, isHeavy, parseTrendsRss, parseWord, publicTopics, refreshTrends, taipeiDay } from "../src/topics";

const BASE = "https://api.lowbatterytown.com";
const AUTH = { Authorization: "Bearer admin-test-token", Origin: BASE };
const NOW = Date.UTC(2026, 9, 7, 19, 17); // 03:17 on 10/8 in Taipei

const rss = (titles: string[]) =>
  `<?xml version="1.0"?><rss><channel><title>Daily Search Trends</title>${titles
    .map((t) => `<item><title>${t}</title><ht:approx_traffic>2000+</ht:approx_traffic></item>`)
    .join("")}</channel></rss>`;

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM lbt_topics").run();
});

describe("trends feed", () => {
  test("keeps item titles, drops the channel title, heavy words, duplicates and long titles", () => {
    const words = parseTrendsRss(rss(["颱風假", "某地車禍", "中秋烤肉", "颱風假", "&lt;b&gt;追劇&lt;/b&gt;", "一".repeat(20), "<![CDATA[新手機]]>"]));
    expect(words).toEqual(["颱風假", "中秋烤肉", "b追劇/b", "新手機"]);
  });

  test("heavy topics are recognised", () => {
    expect(["明星過世", "大樓火災", "槍擊案", "颱風假"].map(isHeavy)).toEqual([true, true, true, false]);
  });

  test("refresh stores today's words in Taipei time and is idempotent", async () => {
    const fake = (async () => new Response(rss(["颱風假", "中秋烤肉"]))) as unknown as typeof fetch;
    expect(await refreshTrends(env.DB, NOW, fake)).toBe(2);
    await refreshTrends(env.DB, NOW, fake);
    const rows = await env.DB.prepare("SELECT word, day FROM lbt_topics ORDER BY word").all();
    expect(rows.results).toEqual([{ word: "中秋烤肉", day: "2026-10-08" }, { word: "颱風假", day: "2026-10-08" }]);
    expect(taipeiDay(NOW)).toBe("2026-10-08");
  });

  test("a failing feed throws so the cron can log it", async () => {
    const down = (async () => new Response("", { status: 503 })) as unknown as typeof fetch;
    await expect(refreshTrends(env.DB, NOW, down)).rejects.toThrow("trends_503");
  });
});

describe("public topics", () => {
  test("with nothing stored it shows the town's own ideas, labelled as ideas", async () => {
    const items = await publicTopics(env.DB);
    expect(items.length).toBeGreaterThanOrEqual(6);
    expect(items.every((t) => t.kind === "idea" && (IDEA_WORDS as readonly string[]).includes(t.word))).toBe(true);
  });

  test("picks come first, then trends; hidden words never show", async () => {
    const fake = (async () => new Response(rss(["颱風假", "中秋烤肉", "追劇", "新手機", "週末去哪", "珍奶"]))) as unknown as typeof fetch;
    await refreshTrends(env.DB, NOW, fake);
    await env.DB.prepare("UPDATE lbt_topics SET hidden = 1 WHERE word = '追劇'").run();
    const res = await SELF.fetch(`${BASE}/api/v1/admin/lbt/topics`, { method: "POST", headers: AUTH, body: JSON.stringify({ word: "Threads 上的貓" }) });
    expect(res.status).toBe(201);

    const pub = await (await SELF.fetch(`${BASE}/api/v1/lbt/topics`)).json() as { items: { word: string; kind: string }[] };
    expect(pub.items[0]).toEqual({ word: "Threads 上的貓", kind: "pick" });
    expect(pub.items.map((t) => t.word)).not.toContain("追劇");
    expect(pub.items.filter((t) => t.kind === "trend").map((t) => t.word)).toEqual(["颱風假", "中秋烤肉", "新手機", "週末去哪", "珍奶"]);
  });
});

describe("admin topics", () => {
  test("needs an admin", async () => {
    expect((await SELF.fetch(`${BASE}/api/v1/admin/lbt/topics`)).status).toBe(401);
  });

  test("rejects links, handles, long numbers and empty words", () => {
    for (const bad of ["", "   ", "https://x.y", "@someone", "0912345678", 3]) {
      expect(() => parseWord(bad)).toThrow();
    }
    expect(parseWord("  週末  去哪 ")).toBe("週末 去哪");
  });

  test("hide, unhide and delete a pick", async () => {
    const added = await (await SELF.fetch(`${BASE}/api/v1/admin/lbt/topics`, { method: "POST", headers: AUTH, body: JSON.stringify({ word: "宵夜" }) })).json() as { id: string };
    const hide = await SELF.fetch(`${BASE}/api/v1/admin/lbt/topics/${added.id}/hidden`, { method: "POST", headers: AUTH, body: JSON.stringify({ hidden: true }) });
    expect(hide.status).toBe(204);
    const list = await (await SELF.fetch(`${BASE}/api/v1/admin/lbt/topics`, { headers: AUTH })).json() as { items: { id: string; hidden: boolean }[] };
    expect(list.items.find((t) => t.id === added.id)?.hidden).toBe(true);
    expect((await SELF.fetch(`${BASE}/api/v1/admin/lbt/topics/${added.id}`, { method: "DELETE", headers: AUTH })).status).toBe(204);
    expect((await SELF.fetch(`${BASE}/api/v1/admin/lbt/topics/${added.id}`, { method: "DELETE", headers: AUTH })).status).toBe(404);
  });
});
