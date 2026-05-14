/**
 * Static ticker messages displayed across the bottom of the town scene.
 * Mixed Chinese + English to match the reference prototype's flavor.
 * Bullet glyphs (•) keep entries visually separated as they scroll past.
 *
 * Update freely — the TickerBar just joins these with spacers and
 * loops them via a CSS drift animation.
 */

export const TICKER_MESSAGES: readonly string[] = [
  "📍 Doc 完成今日第 7 顆番茄加",
  "🏆 本週之星：Kai 累計共同專注 8 小時",
  "🌙 下一場景：黎明（02:07:24 後）",
  "🎵 LOFI BAR 新主題：midnight city · lofi remix",
  "✦ 今晚累計專注時間：212 番茄",
  "🟣 配對中：12 人正在等待夥伴",
  "📰 INK STORE 上架新貼紙：星雲與咖啡",
  "🔥 連續登入 14 天的小鎮民已達 38 人",
];
