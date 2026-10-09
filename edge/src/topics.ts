/**
 * Sky topics: short keywords the home stage carries across the sky (a
 * balloon at dawn, a plane banner by day, a kite at dusk, a neon sign at
 * night). Three honest sources, labelled as what they are:
 *
 * - "trend": yesterday's public search trends for Taiwan (Google Trends
 *   daily RSS), fetched by the daily cron and filtered for distressing
 *   words (deaths, violence, disasters…), so the town does not greet a
 *   low-battery visitor with a tragedy. When Workers AI is bound, each
 *   keyword and its news headline become a light, open question
 *   (topicIssues.ts), stored as `prompt` and shown instead of the keyword.
 * - "pick": words or questions the owner adds in /admin (e.g. an issue
 *   people are discussing on Threads).
 * - "idea": the town's own conversation questions, a different few each
 *   day, used when the others are few.
 *
 * The owner can hide any word. Words are public keywords only: no user
 * content, no PII.
 */
import { cleanText, InputError } from "./rules";

export const TRENDS_URL = "https://trends.google.com/trending/rss?geo=TW";
/** A trending keyword. */
export const WORD_MAX = 16;
/** What the sky can carry on two lines: a keyword, a question or an owner pick. */
export const ISSUE_MAX = 28;
const TRENDS_KEEP = 15;
const MIN_WORDS = 6;

/**
 * The town's own conversation questions for quiet days: light, open, about
 * the person rather than the news. A different few lead each day
 * (`ideasFor`). frontend/lib/lbt/skyTopics.ts keeps the same list for the
 * demo and offline fallback (a frontend test compares the two).
 */
export const IDEA_QUESTIONS = [
  "下班後做的第一件事是什麼？",
  "最近一次笑出來是因為什麼？",
  "如果明天放假一天，你想怎麼過？",
  "最近有一首歌一直重播嗎？",
  "你的宵夜首選是什麼？",
  "最近有被陌生人溫暖到嗎？",
  "小時候最想成為什麼？",
  "有什麼小事會讓你心情變好？",
  "你是早起派還是晚睡派？",
  "最近在追哪部劇或節目？",
  "一個人的時候最喜歡做什麼？",
  "最想再去一次的地方是哪裡？",
  "有沒有一直想學但還沒開始的事？",
  "今天吃到最好吃的是什麼？",
  "用一種天氣形容今天的心情？",
  "你有固定的放鬆小儀式嗎？",
  "最近一件讓你驕傲的小事？",
  "週末通常怎麼充電？",
  "有沒有一部看了很多次的電影？",
  "你比較喜歡貓還是狗？",
  "最近有什麼想吐槽的事嗎？",
  "你相信第一印象嗎？",
  "如果能瞬間學會一個技能，你選什麼？",
  "什麼聲音會讓你覺得安心？",
  "最近一次熬夜是為了什麼？",
  "你有收藏什麼小東西嗎？",
  "最喜歡哪一個季節？",
  "有沒有一個很想念的味道？",
  "通勤的時候都在做什麼？",
  "你會在意已讀不回嗎？",
  "最近有什麼小小的目標？",
  "理想的週末早餐長什麼樣子？",
  "有沒有一句話一直記在心裡？",
  "你是計畫派還是隨興派？",
  "最近才開始喜歡上的東西是什麼？",
  "想跟過去的自己說什麼？",
  "便利商店必買的是什麼？",
  "睡不著的時候你都做什麼？",
  "有沒有一個讓你很自在的地方？",
  "你喜歡熱鬧還是安靜？",
  "最近買過最值得的東西是什麼？",
  "有什麼小習慣是別人不知道的？",
  "你會一個人去吃飯嗎？",
  "最近一次被誇獎是什麼時候？",
  "如果可以搬去任何城市住一年？",
  "最近在學什麼新東西嗎？",
  "有沒有很推薦的一家小店？",
  "你怎麼知道自己該休息了？",
  "最喜歡的一句台詞是什麼？",
  "心情不好的時候會想吃什麼？",
  "有沒有一直想去的展覽或演唱會？",
  "你覺得自己的社交電量平常多高？",
  "最近有什麼值得慶祝的小事？",
  "小時候最喜歡哪部卡通？",
  "如果一整天不用回訊息，你想做什麼？",
  "一天之中最喜歡哪個時段？",
  "最近有沒有什麼新發現？",
  "最近一次覺得「還好有做」的事？",
  "你會怎麼安慰沒電的朋友？",
  "今天有沒有一個小確幸？",
] as const;

/** Words that make a topic too heavy for a low-pressure town. */
const HEAVY = /死|殺|命案|兇|凶手|車禍|墜|溺|自殺|輕生|自盡|地震|罹難|傷亡|身亡|過世|逝世|病逝|喪|火災|大火|爆炸|性侵|猥褻|性騷|家暴|虐|槍|砍|刺傷|失蹤|空難|恐攻|戰爭|轟炸|綁架|遺體|驚傳|噩耗|癌/;

export type TopicKind = "trend" | "pick" | "idea";
export interface PublicTopic {
  word: string;
  kind: TopicKind;
}

export interface TopicRow {
  id: string;
  word: string;
  /** The question shown instead of `word` (trends rewritten by topicIssues.ts), or null. */
  prompt: string | null;
  source: "trends" | "manual";
  day: string;
  hidden: boolean;
  createdAt: string;
}

/** A trending keyword and, when the feed has one, a news headline saying why. */
export interface TrendItem {
  word: string;
  headline: string | null;
}

/**
 * Turns trend items into questions, keyed by keyword. A keyword missing from
 * the map was skipped (too heavy, political, or no good question). Throws
 * when the model is unavailable, so the caller keeps the plain keywords.
 */
export type RewriteTrends = (items: TrendItem[]) => Promise<Map<string, string>>;

/** Calendar day in Taiwan, which is how the owner thinks of "today". */
export function taipeiDay(ms: number): string {
  return new Date(ms + 8 * 3_600_000).toISOString().slice(0, 10);
}

export function isHeavy(word: string): boolean {
  return HEAVY.test(word);
}

/** Today's order of the town's questions: the list starts somewhere new each day. */
export function ideasFor(day: string): string[] {
  const n = IDEA_QUESTIONS.length;
  const dayNumber = Math.floor(Date.parse(`${day}T00:00:00Z`) / 86_400_000);
  const start = (((dayNumber * 7) % n) + n) % n;
  return [...IDEA_QUESTIONS.slice(start), ...IDEA_QUESTIONS.slice(0, start)];
}

/** Validate a keyword typed in /admin. */
export function parseWord(raw: unknown): string {
  if (typeof raw !== "string") throw new InputError("invalid_word");
  const word = cleanText(raw, ISSUE_MAX).replace(/\s+/g, " ").trim();
  if (!word) throw new InputError("invalid_word");
  if (/https?:|www\.|@|\d{6,}/i.test(word)) throw new InputError("invalid_word");
  return word;
}

function decodeEntities(text: string): string {
  return text
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (match, n: string) => {
      const code = n[0] === "x" || n[0] === "X" ? parseInt(n.slice(1), 16) : Number(n);
      // A broken entity in the feed must not fail the whole refresh.
      return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    });
}

const clean = (text: string) => decodeEntities(text).replace(/[<>]/g, "").replace(/\s+/g, " ").trim();

/**
 * Trend items from the RSS, in feed order: the title, and the first news
 * headline as context. Heavy keywords are dropped, and so are keywords whose
 * headline is heavy (a harmless word can trend because of a tragedy).
 */
export function parseTrendItems(xml: string): TrendItem[] {
  const out: TrendItem[] = [];
  for (const item of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/g)) {
    const body = item[1] ?? "";
    const title = /<title\b[^>]*>([\s\S]*?)<\/title>/.exec(body)?.[1];
    if (!title) continue;
    const word = clean(title);
    if (!word || Array.from(word).length > WORD_MAX || isHeavy(word) || out.some((t) => t.word === word)) continue;
    const news = /<ht:news_item_title\b[^>]*>([\s\S]*?)<\/ht:news_item_title>/.exec(body)?.[1];
    const headline = news ? clean(news).slice(0, 120) || null : null;
    if (headline && isHeavy(headline)) continue;
    out.push({ word, headline });
  }
  return out.slice(0, TRENDS_KEEP);
}

/** Item titles from the trends RSS, in feed order, without the heavy ones. */
export function parseTrendsRss(xml: string): string[] {
  return parseTrendItems(xml).map((t) => t.word);
}

/**
 * Daily cron: fetch the trends feed and store today's topics. With a
 * rewriter, only the trends that became a good question are kept (as that
 * question); without one, or when it fails, the plain keywords are kept, so
 * the sky never goes blank. Returns how many were stored.
 */
export async function refreshTrends(
  db: D1Database,
  nowMs: number,
  fetcher: typeof fetch = fetch,
  rewrite?: RewriteTrends,
): Promise<number> {
  const res = await fetcher(TRENDS_URL, {
    headers: { Accept: "application/rss+xml, application/xml" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`trends_${res.status}`);
  const items = parseTrendItems(await res.text());
  let prompts: Map<string, string> | null = null;
  if (rewrite && items.length > 0) {
    try {
      prompts = await rewrite(items);
    } catch {
      prompts = null;
    }
    // Nothing usable came back: keep the keywords rather than an empty sky.
    if (prompts?.size === 0) prompts = null;
  }
  const keep = prompts ? items.filter((t) => prompts.has(t.word)) : items;
  const day = taipeiDay(nowMs);
  const created = new Date(nowMs).toISOString();
  for (const { word } of keep) {
    await db
      .prepare(
        `INSERT INTO lbt_topics (id, word, prompt, source, day, hidden, created_at) VALUES (?, ?, ?, 'trends', ?, 0, ?)
         ON CONFLICT (source, day, word) DO UPDATE SET prompt = COALESCE(excluded.prompt, lbt_topics.prompt)`,
      )
      .bind(crypto.randomUUID(), word, prompts?.get(word) ?? null, day, created)
      .run();
  }
  if (prompts) {
    // A good rewrite replaces today's keyword-only rows: ones it skipped,
    // and ones stored earlier today by a run without the rewrite.
    await db.prepare(`DELETE FROM lbt_topics WHERE source = 'trends' AND day = ? AND prompt IS NULL`).bind(day).run();
  }
  // Keep a week of trends; manual picks stay until the owner deletes them.
  await db.prepare(`DELETE FROM lbt_topics WHERE source = 'trends' AND day < ?`).bind(taipeiDay(nowMs - 7 * 86_400_000)).run();
  return keep.length;
}

function toRow(r: Record<string, unknown>): TopicRow {
  return {
    id: String(r.id), word: String(r.word), prompt: typeof r.prompt === "string" && r.prompt ? r.prompt : null,
    source: r.source === "manual" ? "manual" : "trends",
    day: String(r.day), hidden: Number(r.hidden) === 1, createdAt: String(r.created_at),
  };
}

/** The latest day of trends plus every manual pick, newest first (admin view). */
export async function listTopics(db: D1Database): Promise<TopicRow[]> {
  const latest = await db.prepare(`SELECT MAX(day) AS day FROM lbt_topics WHERE source = 'trends'`).first<{ day: string | null }>();
  const rows = await db
    .prepare(`SELECT * FROM lbt_topics WHERE source = 'manual' OR (source = 'trends' AND day = ?) ORDER BY source DESC, CASE WHEN source = 'manual' THEN created_at END DESC, rowid ASC`)
    .bind(latest?.day ?? "")
    .all();
  return (rows.results as Record<string, unknown>[]).map(toRow);
}

/** What the home page shows: picks, then trends (as their questions), topped up with today's ideas. */
export async function publicTopics(db: D1Database, nowMs: number = Date.now()): Promise<PublicTopic[]> {
  const rows = (await listTopics(db)).filter((r) => !r.hidden);
  const seen = new Set<string>();
  const out: PublicTopic[] = [];
  const add = (word: string, kind: TopicKind) => {
    if (seen.has(word)) return;
    seen.add(word);
    out.push({ word, kind });
  };
  for (const r of rows.filter((r) => r.source === "manual")) add(r.word, "pick");
  for (const r of rows.filter((r) => r.source === "trends")) add(r.prompt ?? r.word, "trend");
  for (const word of ideasFor(taipeiDay(nowMs))) {
    if (out.length >= MIN_WORDS) break;
    add(word, "idea");
  }
  return out;
}

export async function addTopic(db: D1Database, raw: unknown, nowMs: number): Promise<TopicRow> {
  const word = parseWord(raw);
  const row: TopicRow = { id: crypto.randomUUID(), word, prompt: null, source: "manual", day: taipeiDay(nowMs), hidden: false, createdAt: new Date(nowMs).toISOString() };
  await db
    .prepare(`INSERT OR IGNORE INTO lbt_topics (id, word, source, day, hidden, created_at) VALUES (?, ?, 'manual', ?, 0, ?)`)
    .bind(row.id, row.word, row.day, row.createdAt)
    .run();
  return row;
}

export async function setTopicHidden(db: D1Database, id: string, hidden: boolean): Promise<boolean> {
  const r = await db.prepare(`UPDATE lbt_topics SET hidden = ? WHERE id = ?`).bind(hidden ? 1 : 0, id).run();
  return (r.meta.changes ?? 0) > 0;
}

export async function deleteTopic(db: D1Database, id: string): Promise<boolean> {
  const r = await db.prepare(`DELETE FROM lbt_topics WHERE id = ? AND source = 'manual'`).bind(id).run();
  return (r.meta.changes ?? 0) > 0;
}
