/**
 * Profile picker constants ported from `reference/screen-character.jsx`.
 * Each option carries a stable `key` plus per-locale labels so the
 * pickers can render directly off the user's current locale without a
 * round-trip through `messages/*.json` (these lists are
 * tightly-coupled to the picker UI and not reused server-side).
 *
 * Locale scope: zh-TW + en, matching `next-intl.routing.locales`.
 */

export type Locale = "zh-TW" | "en";

export interface InterestOption {
  readonly key: string;
  readonly emoji: string;
  readonly labels: Record<Locale, string>;
}

/** 18 interests — reference's INTEREST_OPTIONS array verbatim. */
export const INTEREST_OPTIONS: readonly InterestOption[] = [
  { key: "coding",    emoji: "⌨", labels: { "zh-TW": "寫程式",  en: "Coding" } },
  { key: "writing",   emoji: "✎", labels: { "zh-TW": "寫作",    en: "Writing" } },
  { key: "reading",   emoji: "📖", labels: { "zh-TW": "閱讀",    en: "Reading" } },
  { key: "art",       emoji: "🎨", labels: { "zh-TW": "畫畫",    en: "Drawing" } },
  { key: "music",     emoji: "♪", labels: { "zh-TW": "音樂",    en: "Music" } },
  { key: "lofi",      emoji: "☁", labels: { "zh-TW": "lofi",    en: "lofi" } },
  { key: "gaming",    emoji: "🕹", labels: { "zh-TW": "遊戲",    en: "Gaming" } },
  { key: "film",      emoji: "🎬", labels: { "zh-TW": "電影",    en: "Film" } },
  { key: "photo",     emoji: "📷", labels: { "zh-TW": "攝影",    en: "Photo" } },
  { key: "cooking",   emoji: "🍳", labels: { "zh-TW": "料理",    en: "Cooking" } },
  { key: "sports",    emoji: "⚽", labels: { "zh-TW": "運動",    en: "Sports" } },
  { key: "travel",    emoji: "✈", labels: { "zh-TW": "旅行",    en: "Travel" } },
  { key: "science",   emoji: "🔬", labels: { "zh-TW": "科學",    en: "Science" } },
  { key: "tea",       emoji: "☕", labels: { "zh-TW": "茶 / 咖啡", en: "Tea / Coffee" } },
  { key: "plants",    emoji: "🌿", labels: { "zh-TW": "植物",    en: "Plants" } },
  { key: "pets",      emoji: "🐾", labels: { "zh-TW": "寵物",    en: "Pets" } },
  { key: "languages", emoji: "🌐", labels: { "zh-TW": "語言學習", en: "Languages" } },
  { key: "finance",   emoji: "💹", labels: { "zh-TW": "理財",    en: "Finance" } },
];

export interface SkillOption {
  readonly key: string;
  readonly labels: Record<Locale, string>;
}

/** 16 skills — reference's SKILL_OPTIONS verbatim. */
export const SKILL_OPTIONS: readonly SkillOption[] = [
  { key: "frontend",  labels: { "zh-TW": "前端開發",    en: "Frontend" } },
  { key: "backend",   labels: { "zh-TW": "後端開發",    en: "Backend" } },
  { key: "design",    labels: { "zh-TW": "UI / UX 設計", en: "UI / UX" } },
  { key: "product",   labels: { "zh-TW": "產品管理",    en: "Product" } },
  { key: "data",      labels: { "zh-TW": "資料分析",    en: "Data" } },
  { key: "research",  labels: { "zh-TW": "研究",        en: "Research" } },
  { key: "marketing", labels: { "zh-TW": "行銷",        en: "Marketing" } },
  { key: "writing",   labels: { "zh-TW": "寫作 / 文案",  en: "Writing" } },
  { key: "illust",    labels: { "zh-TW": "插畫",        en: "Illustration" } },
  { key: "video",     labels: { "zh-TW": "影像剪輯",    en: "Video Editing" } },
  { key: "music_pro", labels: { "zh-TW": "音樂製作",    en: "Music Prod" } },
  { key: "teaching",  labels: { "zh-TW": "教學",        en: "Teaching" } },
  { key: "study",     labels: { "zh-TW": "學業 / 考試",  en: "Studying" } },
  { key: "finance",   labels: { "zh-TW": "財務",        en: "Finance" } },
  { key: "language",  labels: { "zh-TW": "外語",        en: "Languages" } },
  { key: "sports",    labels: { "zh-TW": "運動訓練",    en: "Training" } },
];

export interface RegionOption {
  readonly code: string;
  readonly flag: string;
  readonly labels: Record<Locale, string>;
}

/** 14 cities — reference's REGIONS verbatim. */
export const REGIONS: readonly RegionOption[] = [
  { code: "TW-TPE", flag: "🇹🇼", labels: { "zh-TW": "台北 · Taipei",     en: "Taipei, Taiwan" } },
  { code: "TW-TXG", flag: "🇹🇼", labels: { "zh-TW": "台中 · Taichung",   en: "Taichung, Taiwan" } },
  { code: "TW-KHH", flag: "🇹🇼", labels: { "zh-TW": "高雄 · Kaohsiung",  en: "Kaohsiung, Taiwan" } },
  { code: "JP-TYO", flag: "🇯🇵", labels: { "zh-TW": "東京 · Tokyo",      en: "Tokyo, Japan" } },
  { code: "JP-OSA", flag: "🇯🇵", labels: { "zh-TW": "大阪 · Osaka",      en: "Osaka, Japan" } },
  { code: "KR-SEO", flag: "🇰🇷", labels: { "zh-TW": "首爾 · Seoul",      en: "Seoul, Korea" } },
  { code: "HK",     flag: "🇭🇰", labels: { "zh-TW": "香港 · HK",         en: "Hong Kong" } },
  { code: "SG",     flag: "🇸🇬", labels: { "zh-TW": "新加坡 · SG",       en: "Singapore" } },
  { code: "US-SFO", flag: "🇺🇸", labels: { "zh-TW": "SF Bay Area",      en: "SF Bay Area" } },
  { code: "US-NYC", flag: "🇺🇸", labels: { "zh-TW": "紐約 · NYC",        en: "New York" } },
  { code: "CA-TOR", flag: "🇨🇦", labels: { "zh-TW": "多倫多",            en: "Toronto" } },
  { code: "GB-LON", flag: "🇬🇧", labels: { "zh-TW": "倫敦",              en: "London" } },
  { code: "DE-BER", flag: "🇩🇪", labels: { "zh-TW": "柏林",              en: "Berlin" } },
  { code: "OTHER",  flag: "🌍", labels: { "zh-TW": "其他",              en: "Other" } },
];

/** Daily-goal preset options — number is # of 25-min focus sessions. */
export const DAILY_GOALS = [2, 4, 6, 8] as const;
export type DailyGoal = (typeof DAILY_GOALS)[number];
