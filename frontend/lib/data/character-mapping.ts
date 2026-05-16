/**
 * Avatar (visual sprite) ↔ Character (backend enum) mapping.
 *
 * `AVATARS` (in `lib/pixel/sprites/avatars.ts`) carries the 30 hand-pixeled
 * heads ported from reference. `CHARACTERS` (in `lib/data/characters.ts`)
 * carries the 30-key roster the backend `user.character_key` enum expects.
 *
 * The two arrays were created independently and are NOT 1:1 ordinally
 * aligned past index 7. This map picks the closest semantic CHARACTERS
 * key per avatar so that visual selection still flows to a valid backend
 * key. A few mappings (`crypto`, `blackhat`, `astronaut`, `mystery`) are
 * deliberate stretches — flagged inline. The mapping is intentionally
 * many-to-one in those slots: backend doesn't care that two avatars
 * resolve to the same `character_key`.
 */

const MAP: Readonly<Record<string, string>> = {
  designer: "luna",      // UI 設計師
  frontend: "kai",       // 前端工程師
  novelist: "milo",      // 小說作家
  researcher: "aria",    // 研究員
  musician: "zoe",       // 音樂製作人
  photo: "rex",          // 攝影師
  philo: "nyx",          // 哲學家
  barista: "bear",       // 咖啡師
  chef: "toki",          // 廚師    (NOT chef→leo)
  data: "panda",         // 資料科學家
  gamer: "drake",        // 遊戲開發者
  crypto: "leo",         // 創業者 — stretch: nearest "risk-taker" role
  blackhat: "hawk",      // 策略顧問 — stretch: nearest "security/strategy"
  ux: "finn",            // UX 研究員
  writer: "ink",         // 文案作家
  pm: "nova",            // 產品經理
  marketing: "tora",     // 行銷企劃
  lang: "rio",           // 語言學習者
  astro: "lyra",         // 天文愛好者
  eco: "sage",           // 環境設計師
  health: "doc",         // 醫師
  teacher: "mei",        // 教師
  lawyer: "just",        // 律師
  athlete: "run",        // 運動員
  student: "stu",        // 學生
  content: "film",       // 內容創作者
  psych: "mind",         // 心理師
  accountant: "tally",   // 會計師
  astronaut: "uni",      // 插畫師 — stretch: dreamer/imagination tone
  mystery: "yuki",       // 譯者   — stretch: catch-all
};

/**
 * Resolve a pixel avatar id to its backend `character_key`. Falls back
 * to `luna` (the first entry, a safe default) if the id is unknown.
 */
export function avatarIdToCharacterKey(avatarId: string): string {
  return MAP[avatarId] ?? "luna";
}
