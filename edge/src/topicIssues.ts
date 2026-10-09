/**
 * Yesterday's trending searches as questions people can actually talk
 * about: "颱風假" becomes "颱風假你都怎麼過？", so the sky offers an issue,
 * not a bare keyword. One batched call per day to a text model on Workers AI
 * (`env.AI`, model in LBT_TOPICS_MODEL). Only public keywords and news
 * headlines go in, never anything about visitors.
 *
 * Every answer is checked before it is shown: Traditional Chinese only, a
 * short single question, no heavy or partisan words, no links or handles.
 * The model is also told to answer SKIP for anything heavy or political;
 * skipped trends are left out of the sky.
 */
import { ISSUE_MAX, isHeavy, type RewriteTrends, type TrendItem } from "./topics";

export const DEFAULT_TOPICS_MODEL = "@cf/qwen/qwen3-30b-a3b-fp8";

/** Party politics splits a low-pressure chat; leave it out of the sky. */
const POLITICAL = /選舉|罷免|立委|議員|總統|政黨|國民黨|民進黨|民眾黨|藍綠|公投|黨團|政見/;

/**
 * Common Simplified-only characters. A question containing any of them is
 * not Traditional Chinese and is dropped (the model sometimes slips).
 */
const SIMPLIFIED =
  /[们这说时为会个来对过东车买让还关开问题吗样头没实现进动经长电话见觉点认应学业员机级岁边两亲爱钱华产从众乐书龙页飞马鸟鱼黄门间闻陆难欢气节约红绿热听号网猫饭梦办视剧图务处区费选举发]/;

export const SYSTEM_PROMPT = [
  "你是「低電量小鎮」的編輯。小鎮讓社交電量低的人放鬆地跟陌生人聊天。",
  "我會給你昨天台灣的熱門搜尋關鍵字，以及說明它為什麼熱門的新聞標題。",
  "請把每一個改寫成一句輕鬆、好開口、任何人都能回答的聊天問題。",
  "規則：",
  "- 繁體中文、台灣用語，用「你」，口語自然。",
  "- 每句 6 到 20 個字，只有一句，以「？」結尾。",
  "- 問對方的經驗、感受或看法，不需要懂新聞細節也能回答。",
  "- 避開人名（公眾人物也改問相關的日常話題）、政黨、選舉、政治爭議、宗教、投資與醫療建議。",
  "- 遇到死亡、意外、犯罪、災難、疾病、戰爭、自殺或任何沉重的事，答 SKIP。",
  "- 不要引號、表情符號、網址或 hashtag。",
  '只輸出 JSON 陣列，每個元素是 {"id": 編號, "q": "問題或 SKIP"}，不要其他文字。',
].join("\n");

export function userPrompt(items: TrendItem[]): string {
  const list = items.map((t, i) => ({ id: i + 1, keyword: t.word, news: t.headline ?? "" }));
  // "/no_think" turns off Qwen3's reasoning pass; other models ignore it.
  return `${JSON.stringify(list)}\n/no_think`;
}

/** A model answer made safe to show, or null when it should not be. */
export function cleanIssue(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let q = raw.replace(/^[\s"'“”「」『』]+|[\s"'“”「」『』]+$/g, "").replace(/\s+/g, " ").trim();
  if (!q || /skip/i.test(q)) return null;
  q = q.replace(/\?$/, "？");
  if (!q.endsWith("？")) q = `${q}？`;
  const length = Array.from(q).length;
  if (length < 5 || length > ISSUE_MAX) return null;
  if (!/[一-鿿]/.test(q)) return null;
  if (/https?:|www\.|@|#|\d{6,}|\n/i.test(q)) return null;
  if ((q.match(/？/g) ?? []).length > 1) return null;
  if (isHeavy(q) || POLITICAL.test(q) || SIMPLIFIED.test(q)) return null;
  return q;
}

/** The text of a model response, whatever shape the model returns. */
export function responseText(result: unknown): string {
  const r = result as Record<string, unknown> | null;
  if (!r) return "";
  if (typeof r.response === "string") return r.response;
  const choice = (r.choices as { message?: { content?: unknown } }[] | undefined)?.[0]?.message?.content;
  if (typeof choice === "string") return choice;
  const blocks = r.content as { type?: string; text?: unknown }[] | undefined;
  if (Array.isArray(blocks)) return blocks.map((b) => (typeof b.text === "string" ? b.text : "")).join("");
  return "";
}

/** Map keyword -> question from the model's JSON answer; anything unusable is left out. */
export function parseRewrites(text: string, items: TrendItem[]): Map<string, string> {
  const body = text.replace(/<think>[\s\S]*?<\/think>/g, "");
  const start = body.indexOf("[");
  const end = body.lastIndexOf("]");
  if (start < 0 || end <= start) throw new Error("rewrite_unparsable");
  const parsed: unknown = JSON.parse(body.slice(start, end + 1));
  if (!Array.isArray(parsed)) throw new Error("rewrite_unparsable");
  const out = new Map<string, string>();
  const used = new Set<string>();
  for (const entry of parsed) {
    const { id, q } = (entry ?? {}) as { id?: unknown; q?: unknown };
    const item = typeof id === "number" ? items[id - 1] : undefined;
    const question = cleanIssue(q);
    if (!item || !question || used.has(question)) continue;
    used.add(question);
    out.set(item.word, question);
  }
  return out;
}

/** Run one model call; models outside Workers AI (`author/model`) go through the AI Gateway. */
export type RunModel = (input: Record<string, unknown>) => Promise<unknown>;

export async function rewriteTrends(items: TrendItem[], run: RunModel, anthropicFormat = false): Promise<Map<string, string>> {
  const user = userPrompt(items);
  const input = anthropicFormat
    ? { system: SYSTEM_PROMPT, messages: [{ role: "user", content: user }], max_tokens: 1200 }
    : { messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: user }], max_tokens: 1200, temperature: 0.6 };
  return parseRewrites(responseText(await run(input)), items);
}

export interface IssueEnv {
  AI?: Ai;
  LBT_TOPICS_MODEL?: string;
  LBT_AI_GATEWAY?: string;
}

/** The daily rewriter for this deployment, or undefined when no AI binding is configured. */
export function issueRewriter(env: IssueEnv): RewriteTrends | undefined {
  const ai = env.AI;
  if (!ai) return undefined;
  const model = env.LBT_TOPICS_MODEL?.trim() || DEFAULT_TOPICS_MODEL;
  const hosted = model.startsWith("@cf/");
  const options = hosted ? undefined : { gateway: { id: env.LBT_AI_GATEWAY?.trim() || "default" } };
  const run: RunModel = (input) =>
    (ai.run as unknown as (m: string, i: Record<string, unknown>, o?: unknown) => Promise<unknown>)(model, input, options);
  return (items) => rewriteTrends(items, run, model.startsWith("anthropic/"));
}
