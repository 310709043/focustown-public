/**
 * Sky topics for the home stage (see edge/src/topics.ts). Live mode loads
 * `GET /api/v1/lbt/topics`; the demo, or a failed load, uses the town's own
 * everyday ideas. Each word keeps its source so the label stays honest:
 * "trend" = yesterday's public search trends, "pick" = chosen by the town,
 * "idea" = an everyday topic. Words are rendered as React text only.
 */
import { create } from "zustand";

export type SkyTopicKind = "trend" | "pick" | "idea";
export interface SkyTopic {
  word: string;
  kind: SkyTopicKind;
}

export const IDEA_WORDS = [
  "下雨天", "週末計畫", "宵夜", "最近在追的劇", "通勤", "想去的地方",
  "寵物", "今天的晚餐", "失眠", "最近在聽的歌", "小確幸", "放假",
] as const;
const WORD_MAX = 16;
const KINDS: readonly SkyTopicKind[] = ["trend", "pick", "idea"];

export const IDEA_TOPICS: SkyTopic[] = IDEA_WORDS.map((word) => ({ word, kind: "idea" }));

/** Keep only well-formed items; anything odd is dropped, never guessed. */
export function toSkyTopics(raw: unknown): SkyTopic[] {
  const items = (raw as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) return [];
  return items.flatMap((item) => {
    const { word, kind } = (item ?? {}) as Record<string, unknown>;
    if (typeof word !== "string" || !KINDS.includes(kind as SkyTopicKind)) return [];
    const clean = word.trim();
    if (!clean || Array.from(clean).length > WORD_MAX) return [];
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
    if (source === "demo") return;
    set({ items: await fetchSkyTopics(apiBaseUrl), index: 0 });
  },
  next: () => set((s) => ({ index: (s.index + 1) % Math.max(1, s.items.length) })),
}));

export function currentSkyTopic(s: Pick<SkyTopicsState, "items" | "index">): SkyTopic {
  return s.items[s.index % s.items.length] ?? IDEA_TOPICS[0];
}
