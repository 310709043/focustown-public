/**
 * Sky topics: short keywords the home stage carries across the sky (a
 * balloon at dawn, a plane banner by day, a kite at dusk, a neon sign at
 * night). Three honest sources, labelled as what they are:
 *
 * - "trend": yesterday's public search trends for Taiwan (Google Trends
 *   daily RSS), fetched by the daily cron and filtered for distressing
 *   words (deaths, violence, disasters…), so the town does not greet a
 *   low-battery visitor with a tragedy.
 * - "pick": words the owner adds in /admin (e.g. something trending on
 *   Threads).
 * - "idea": the town's own everyday topics, used when the others are few.
 *
 * The owner can hide any word. Words are public keywords only: no user
 * content, no PII.
 */
import { cleanText, InputError } from "./rules";

export const TRENDS_URL = "https://trends.google.com/trending/rss?geo=TW";
export const WORD_MAX = 16;
const TRENDS_KEEP = 15;
const MIN_WORDS = 6;

/** Everyday conversation starters for quiet days. */
export const IDEA_WORDS = [
  "下雨天", "週末計畫", "宵夜", "最近在追的劇", "通勤", "想去的地方",
  "寵物", "今天的晚餐", "失眠", "最近在聽的歌", "小確幸", "放假",
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
  source: "trends" | "manual";
  day: string;
  hidden: boolean;
  createdAt: string;
}

/** Calendar day in Taiwan, which is how the owner thinks of "today". */
export function taipeiDay(ms: number): string {
  return new Date(ms + 8 * 3_600_000).toISOString().slice(0, 10);
}

export function isHeavy(word: string): boolean {
  return HEAVY.test(word);
}

/** Validate a keyword typed in /admin. */
export function parseWord(raw: unknown): string {
  if (typeof raw !== "string") throw new InputError("invalid_word");
  const word = cleanText(raw, WORD_MAX).replace(/\s+/g, " ").trim();
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

/** Item titles from the trends RSS, in feed order, without the heavy ones. */
export function parseTrendsRss(xml: string): string[] {
  const out: string[] = [];
  for (const item of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/g)) {
    const title = /<title\b[^>]*>([\s\S]*?)<\/title>/.exec(item[1] ?? "")?.[1];
    if (!title) continue;
    const word = decodeEntities(title).replace(/[<>]/g, "").replace(/\s+/g, " ").trim();
    if (!word || Array.from(word).length > WORD_MAX || isHeavy(word) || out.includes(word)) continue;
    out.push(word);
  }
  return out.slice(0, TRENDS_KEEP);
}

/** Daily cron: fetch the trends feed and store today's words. Returns how many were stored. */
export async function refreshTrends(db: D1Database, nowMs: number, fetcher: typeof fetch = fetch): Promise<number> {
  const res = await fetcher(TRENDS_URL, {
    headers: { Accept: "application/rss+xml, application/xml" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`trends_${res.status}`);
  const words = parseTrendsRss(await res.text());
  const day = taipeiDay(nowMs);
  const created = new Date(nowMs).toISOString();
  for (const word of words) {
    await db
      .prepare(`INSERT OR IGNORE INTO lbt_topics (id, word, source, day, hidden, created_at) VALUES (?, ?, 'trends', ?, 0, ?)`)
      .bind(crypto.randomUUID(), word, day, created)
      .run();
  }
  // Keep a week of trends; manual picks stay until the owner deletes them.
  await db.prepare(`DELETE FROM lbt_topics WHERE source = 'trends' AND day < ?`).bind(taipeiDay(nowMs - 7 * 86_400_000)).run();
  return words.length;
}

function toRow(r: Record<string, unknown>): TopicRow {
  return {
    id: String(r.id), word: String(r.word), source: r.source === "manual" ? "manual" : "trends",
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

/** What the home page shows: picks, then trends, topped up with ideas. */
export async function publicTopics(db: D1Database): Promise<PublicTopic[]> {
  const rows = (await listTopics(db)).filter((r) => !r.hidden);
  const seen = new Set<string>();
  const out: PublicTopic[] = [];
  const add = (word: string, kind: TopicKind) => {
    if (seen.has(word)) return;
    seen.add(word);
    out.push({ word, kind });
  };
  for (const r of rows.filter((r) => r.source === "manual")) add(r.word, "pick");
  for (const r of rows.filter((r) => r.source === "trends")) add(r.word, "trend");
  for (const word of IDEA_WORDS) {
    if (out.length >= MIN_WORDS) break;
    add(word, "idea");
  }
  return out;
}

export async function addTopic(db: D1Database, raw: unknown, nowMs: number): Promise<TopicRow> {
  const word = parseWord(raw);
  const row: TopicRow = { id: crypto.randomUUID(), word, source: "manual", day: taipeiDay(nowMs), hidden: false, createdAt: new Date(nowMs).toISOString() };
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
