/**
 * Sky topics: the trends feed is parsed and filtered for heavy words, the
 * public list is honest about each word's source and never empty, and the
 * owner can add, hide and delete words from /admin.
 */
import { SELF } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, test } from "vitest";

import { cleanIssue, issueRewriter, parseRewrites, responseText, rewriteTrends } from "../src/topicIssues";
import {
  IDEA_QUESTIONS, ideasFor, isHeavy, parseTrendItems, parseTrendsRss, parseWord, publicTopics, refreshTrends, taipeiDay,
  type TrendItem,
} from "../src/topics";

const BASE = "https://api.lowbatterytown.com";
const AUTH = { Authorization: "Bearer admin-test-token", Origin: BASE };
const NOW = Date.UTC(2026, 9, 7, 19, 17); // 03:17 on 10/8 in Taipei

const rss = (titles: string[], news: Record<string, string> = {}) =>
  `<?xml version="1.0"?><rss><channel><title>Daily Search Trends</title>${titles
    .map((t) => `<item><title>${t}</title><ht:approx_traffic>2000+</ht:approx_traffic>${
      news[t] ? `<ht:news_item><ht:news_item_title>${news[t]}</ht:news_item_title></ht:news_item>` : ""
    }</item>`)
    .join("")}</channel></rss>`;

/** A model that answers with the given questions, in the shape Workers AI returns. */
const model = (answer: unknown) => async () => ({ response: typeof answer === "string" ? answer : JSON.stringify(answer) });

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM lbt_topics").run();
});

describe("trends feed", () => {
  test("keeps item titles, drops the channel title, heavy words, duplicates and long titles", () => {
    const words = parseTrendsRss(rss(["颱風假", "某地車禍", "中秋烤肉", "颱風假", "&lt;b&gt;追劇&lt;/b&gt;", "一".repeat(20), "<![CDATA[新手機]]>"]));
    expect(words).toEqual(["颱風假", "中秋烤肉", "b追劇/b", "新手機"]);
  });

  test("numeric entities decode, and a broken one does not fail the feed", () => {
    expect(parseTrendsRss(rss(["&#39340;&#x9EB5;", "壞&#99999999;字"]))).toEqual(["馬麵", "壞&#99999999;字"]);
  });

  test("each trend keeps its first news headline; a heavy headline drops the trend", () => {
    const items = parseTrendItems(rss(["颱風假", "中秋烤肉", "新手機"], {
      颱風假: "北北基明天停班停課",
      中秋烤肉: "烤肉引發火災 一家三口送醫",
    }));
    expect(items).toEqual([{ word: "颱風假", headline: "北北基明天停班停課" }, { word: "新手機", headline: null }]);
  });

  test("heavy topics are recognised", () => {
    expect(["明星過世", "大樓火災", "槍擊案", "颱風假"].map(isHeavy)).toEqual([true, true, true, false]);
  });

  test("refresh stores today's words in Taipei time and is idempotent", async () => {
    const fake = (async () => new Response(rss(["颱風假", "中秋烤肉"]))) as unknown as typeof fetch;
    expect(await refreshTrends(env.DB, NOW, fake)).toBe(2);
    await refreshTrends(env.DB, NOW, fake);
    const rows = await env.DB.prepare("SELECT word, prompt, day FROM lbt_topics ORDER BY word").all();
    expect(rows.results).toEqual([
      { word: "中秋烤肉", prompt: null, day: "2026-10-08" },
      { word: "颱風假", prompt: null, day: "2026-10-08" },
    ]);
    expect(taipeiDay(NOW)).toBe("2026-10-08");
  });

  test("with a rewriter, trends become questions and skipped ones stay out of the sky", async () => {
    const fake = (async () => new Response(rss(["颱風假", "罷免投票", "新手機"]))) as unknown as typeof fetch;
    const rewrite = async (items: TrendItem[]) =>
      parseRewrites(JSON.stringify([{ id: 1, q: "颱風假你都怎麼過？" }, { id: 2, q: "SKIP" }, { id: 3, q: "新手機你會想換嗎？" }]), items);
    expect(await refreshTrends(env.DB, NOW, fake, rewrite)).toBe(2);
    const pub = await publicTopics(env.DB, NOW);
    expect(pub.filter((t) => t.kind === "trend").map((t) => t.word)).toEqual(["颱風假你都怎麼過？", "新手機你會想換嗎？"]);
  });

  test("a failing rewriter keeps the plain keywords, so the sky is never blank", async () => {
    const fake = (async () => new Response(rss(["颱風假", "新手機"]))) as unknown as typeof fetch;
    const broken = async () => {
      throw new Error("model down");
    };
    expect(await refreshTrends(env.DB, NOW, fake, broken)).toBe(2);
    const pub = await publicTopics(env.DB, NOW);
    expect(pub.filter((t) => t.kind === "trend").map((t) => t.word)).toEqual(["颱風假", "新手機"]);
  });

  test("a failing feed throws so the cron can log it", async () => {
    const down = (async () => new Response("", { status: 503 })) as unknown as typeof fetch;
    await expect(refreshTrends(env.DB, NOW, down)).rejects.toThrow("trends_503");
  });
});

describe("public topics", () => {
  test("with nothing stored it shows the town's own questions, labelled as ideas", async () => {
    const items = await publicTopics(env.DB, NOW);
    expect(items.length).toBeGreaterThanOrEqual(6);
    expect(items.every((t) => t.kind === "idea" && (IDEA_QUESTIONS as readonly string[]).includes(t.word))).toBe(true);
  });

  test("the town's questions lead with a different few each day", () => {
    const today = ideasFor("2026-10-08");
    const tomorrow = ideasFor("2026-10-09");
    expect([today.length, new Set(today).size]).toEqual([IDEA_QUESTIONS.length, IDEA_QUESTIONS.length]);
    expect(today.slice(0, 6)).not.toEqual(tomorrow.slice(0, 6));
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

  test("a pick can be a whole question, up to 28 characters", () => {
    expect(parseWord("大家都在聊的「躺平」你怎麼看？")).toBe("大家都在聊的「躺平」你怎麼看？");
    expect(Array.from(parseWord("一".repeat(40))).length).toBe(28);
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

describe("trend questions (Workers AI)", () => {
  const items: TrendItem[] = [
    { word: "颱風假", headline: "北北基明天停班停課" },
    { word: "新手機", headline: null },
    { word: "某明星", headline: "某明星宣布婚訊" },
  ];

  test("a good answer becomes questions keyed by keyword", () => {
    const text = `<think>先想想</think>好的：[{"id":1,"q":"颱風假你都怎麼過？"},{"id":2,"q":"「新手機你會想換嗎?」"},{"id":3,"q":"SKIP"}]`;
    expect([...parseRewrites(text, items)]).toEqual([["颱風假", "颱風假你都怎麼過？"], ["新手機", "新手機你會想換嗎？"]]);
  });

  test("unsafe or unusable questions are dropped", () => {
    expect(cleanIssue("颱風天你都怎麼過？")).toBe("颱風天你都怎麼過？");
    expect(cleanIssue("最近一次被暖到")).toBe("最近一次被暖到？");
    for (const bad of [
      "台风假你都怎么过？", // Simplified Chinese
      "這次罷免你怎麼看？", // partisan politics
      "聽到這起車禍你有什麼感覺？", // heavy
      "看 https://x.y 你覺得呢？",
      "你好？還好嗎？",
      "一".repeat(30),
      "Do you like it?",
      "SKIP",
      42,
    ]) {
      expect(cleanIssue(bad)).toBeNull();
    }
  });

  test("an answer without a JSON list throws, so the keywords are kept", () => {
    expect(() => parseRewrites("抱歉，我無法完成。", items)).toThrow("rewrite_unparsable");
  });

  test("reads Workers AI, chat-completions and Anthropic response shapes", () => {
    expect(responseText({ response: "a" })).toBe("a");
    expect(responseText({ choices: [{ message: { content: "b" } }] })).toBe("b");
    expect(responseText({ content: [{ type: "text", text: "c" }] })).toBe("c");
    expect(responseText(null)).toBe("");
  });

  test("one batched call carries the keywords and headlines, never anything about visitors", async () => {
    let seen: Record<string, unknown> | null = null;
    const run = async (input: Record<string, unknown>) => {
      seen = input;
      return model([{ id: 1, q: "颱風假你都怎麼過？" }])();
    };
    const out = await rewriteTrends(items, run);
    expect(out.get("颱風假")).toBe("颱風假你都怎麼過？");
    const user = (seen!.messages as { role: string; content: string }[]).find((m) => m.role === "user")!.content;
    expect(JSON.parse(user.split("\n")[0]!)).toEqual([
      { id: 1, keyword: "颱風假", news: "北北基明天停班停課" },
      { id: 2, keyword: "新手機", news: "" },
      { id: 3, keyword: "某明星", news: "某明星宣布婚訊" },
    ]);
  });

  test("with no AI binding there is no rewriter", () => {
    expect(issueRewriter({})).toBeUndefined();
  });

  test("the rewriter calls the configured model", async () => {
    const calls: unknown[][] = [];
    const ai = { run: async (...args: unknown[]) => { calls.push(args); return { response: '[{"id":1,"q":"颱風假你都怎麼過？"}]' }; } };
    const rewrite = issueRewriter({ AI: ai as unknown as Ai, LBT_TOPICS_MODEL: "@cf/test/model" })!;
    expect((await rewrite(items)).get("颱風假")).toBe("颱風假你都怎麼過？");
    expect([calls[0]![0], calls[0]![2]]).toEqual(["@cf/test/model", undefined]);
  });
});
