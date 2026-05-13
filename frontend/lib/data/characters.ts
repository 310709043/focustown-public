// Character roster ported from reference.html. Treat as a constant catalog;
// in v2 these can move into a CMS or a /characters API endpoint.

export type CharacterDef = {
  key: string;
  emoji: string;
  name: string;
  role: string;
  bodyColor: string;
  roofColor: string;
};

export const CHARACTERS: CharacterDef[] = [
  { key: "luna",  emoji: "🐱", name: "Luna",  role: "UI 設計師",   bodyColor: "#6d28d9", roofColor: "#5b21b6" },
  { key: "kai",   emoji: "🦊", name: "Kai",   role: "前端工程師",  bodyColor: "#b45309", roofColor: "#92400e" },
  { key: "milo",  emoji: "🐸", name: "Milo",  role: "小說作家",    bodyColor: "#065f46", roofColor: "#064e3b" },
  { key: "aria",  emoji: "🌸", name: "Aria",  role: "研究員",      bodyColor: "#9d174d", roofColor: "#831843" },
  { key: "zoe",   emoji: "🦋", name: "Zoe",   role: "音樂製作人",  bodyColor: "#3730a3", roofColor: "#312e81" },
  { key: "rex",   emoji: "🐺", name: "Rex",   role: "攝影師",      bodyColor: "#92400e", roofColor: "#78350f" },
  { key: "nyx",   emoji: "🦉", name: "Nyx",   role: "哲學家",      bodyColor: "#1e1b4b", roofColor: "#14124a" },
  { key: "bear",  emoji: "🐻", name: "Bear",  role: "咖啡師",      bodyColor: "#7c2d12", roofColor: "#6b2711" },
  { key: "leo",   emoji: "🦁", name: "Leo",   role: "創業者",      bodyColor: "#854d0e", roofColor: "#713f12" },
  { key: "panda", emoji: "🐼", name: "Panda", role: "資料科學家",  bodyColor: "#374151", roofColor: "#1f2937" },
  { key: "uni",   emoji: "🦄", name: "Uni",   role: "插畫師",      bodyColor: "#7e22ce", roofColor: "#6b21a8" },
  { key: "drake", emoji: "🐉", name: "Drake", role: "遊戲開發者",  bodyColor: "#166534", roofColor: "#14532d" },
  { key: "hawk",  emoji: "🦅", name: "Hawk",  role: "策略顧問",    bodyColor: "#1d4ed8", roofColor: "#1e3a8a" },
  { key: "finn",  emoji: "🐬", name: "Finn",  role: "UX 研究員",   bodyColor: "#0369a1", roofColor: "#075985" },
  { key: "ink",   emoji: "🐙", name: "Ink",   role: "文案作家",    bodyColor: "#6b21a8", roofColor: "#581c87" },
  { key: "nova",  emoji: "🦚", name: "Nova",  role: "產品經理",    bodyColor: "#0f766e", roofColor: "#0d5c63" },
  { key: "tora",  emoji: "🐯", name: "Tora",  role: "行銷企劃",    bodyColor: "#b45309", roofColor: "#a16207" },
  { key: "rio",   emoji: "🦜", name: "Rio",   role: "語言學習者",  bodyColor: "#0891b2", roofColor: "#0e7490" },
  { key: "lyra",  emoji: "🌙", name: "Lyra",  role: "天文愛好者",  bodyColor: "#4338ca", roofColor: "#3730a3" },
  { key: "sage",  emoji: "🌿", name: "Sage",  role: "環境設計師",  bodyColor: "#166534", roofColor: "#15532d" },
  { key: "doc",   emoji: "🩺", name: "Doc",   role: "醫師",        bodyColor: "#0e7490", roofColor: "#155e75" },
  { key: "mei",   emoji: "👩‍🏫", name: "Mei", role: "教師",       bodyColor: "#a16207", roofColor: "#854d0e" },
  { key: "toki",  emoji: "👨‍🍳", name: "Toki", role: "廚師",      bodyColor: "#9a3412", roofColor: "#7c2d12" },
  { key: "yuki",  emoji: "🌐", name: "Yuki",  role: "譯者",        bodyColor: "#0c4a6e", roofColor: "#082f49" },
  { key: "film",  emoji: "🎬", name: "Film",  role: "內容創作者",  bodyColor: "#7c2d12", roofColor: "#6b2711" },
  { key: "mind",  emoji: "🧠", name: "Mind",  role: "心理師",      bodyColor: "#3730a3", roofColor: "#312e81" },
  { key: "tally", emoji: "📊", name: "Tally", role: "會計師",      bodyColor: "#1f2937", roofColor: "#111827" },
  { key: "just",  emoji: "⚖️", name: "Just",  role: "律師",        bodyColor: "#4c1d95", roofColor: "#3b0764" },
  { key: "run",   emoji: "🏃", name: "Run",   role: "運動員",      bodyColor: "#15803d", roofColor: "#14532d" },
  { key: "stu",   emoji: "📚", name: "Stu",   role: "學生",        bodyColor: "#1e40af", roofColor: "#1e3a8a" },
];

export function findCharacter(key: string | null | undefined): CharacterDef | undefined {
  if (!key) return undefined;
  return CHARACTERS.find((c) => c.key === key);
}
