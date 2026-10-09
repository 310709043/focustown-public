/**
 * Sky topics for the home stage (see edge/src/topics.ts). Live mode loads
 * `GET /api/v1/lbt/topics`; the demo, or a failed load, uses the town's own
 * conversation questions. Each topic keeps its source so the label stays
 * honest: "trend" = from yesterday's public search trends (usually rewritten
 * into a question by the edge cron), "pick" = chosen by the town, "idea" =
 * one of the town's own questions. Rendered as React text only.
 */
import { create } from "zustand";

export type SkyTopicKind = "trend" | "pick" | "idea";
export interface SkyTopic {
  word: string;
  kind: SkyTopicKind;
}

/**
 * The town's own questions, the same list and order as IDEA_QUESTIONS in
 * edge/src/topics.ts (tests/unit/lib/lbt/skyTopics.test.tsx compares them).
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
/** A keyword or a question, on at most two lines in the sky. */
export const TOPIC_MAX = 28;
const KINDS: readonly SkyTopicKind[] = ["trend", "pick", "idea"];

export const IDEA_TOPICS: SkyTopic[] = IDEA_QUESTIONS.map((word) => ({ word, kind: "idea" }));

/** The town's questions starting somewhere new each day, like the edge's `ideasFor`. */
export function ideaTopicsFor(date: Date): SkyTopic[] {
  const n = IDEA_TOPICS.length;
  const dayNumber = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
  const start = (((dayNumber * 7) % n) + n) % n;
  return [...IDEA_TOPICS.slice(start), ...IDEA_TOPICS.slice(0, start)];
}

/** Topics phrased as a question open the chat as they are; keywords get a frame. */
export const isQuestion = (word: string): boolean => /[？?]$/.test(word.trim());

/** Keep only well-formed items; anything odd is dropped, never guessed. */
export function toSkyTopics(raw: unknown): SkyTopic[] {
  const items = (raw as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) return [];
  return items.flatMap((item) => {
    const { word, kind } = (item ?? {}) as Record<string, unknown>;
    if (typeof word !== "string" || !KINDS.includes(kind as SkyTopicKind)) return [];
    const clean = word.trim();
    if (!clean || Array.from(clean).length > TOPIC_MAX) return [];
    return [{ word: clean, kind: kind as SkyTopicKind }];
  });
}

export async function fetchSkyTopics(apiBaseUrl: string, fetchImpl: typeof fetch = fetch): Promise<SkyTopic[]> {
  try {
    const res = await fetchImpl(`${apiBaseUrl.replace(/\/$/, "")}/api/v1/lbt/topics`);
    if (!res.ok) return IDEA_TOPICS;
    const topics = toSkyTopics(await res.json());
    return topics.length > 0 ? topics : IDEA_TOPICS;
  } catch {
    return IDEA_TOPICS;
  }
}

interface SkyTopicsState {
  items: SkyTopic[];
  index: number;
  loaded: boolean;
  load: (source: "live" | "demo", apiBaseUrl: string) => Promise<void>;
  next: () => void;
}

export const useSkyTopics = create<SkyTopicsState>((set, get) => ({
  items: IDEA_TOPICS,
  index: 0,
  loaded: false,
  async load(source, apiBaseUrl) {
    if (get().loaded) return;
    set({ loaded: true });
    // The demo has no API: today's turn of the town's own questions.
    if (source === "demo") {
      set({ items: ideaTopicsFor(new Date()), index: 0 });
      return;
    }
    set({ items: await fetchSkyTopics(apiBaseUrl), index: 0 });
  },
  next: () => set((s) => ({ index: (s.index + 1) % Math.max(1, s.items.length) })),
}));

export function currentSkyTopic(s: Pick<SkyTopicsState, "items" | "index">): SkyTopic {
  return s.items[s.index % s.items.length] ?? IDEA_TOPICS[0];
}
