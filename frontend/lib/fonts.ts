import localFont from "next/font/local";

/**
 * Legacy Focus Town (pixel-city) fonts, declared only on the (legacy) and
 * (dev) layouts. Self-hosted Latin subsets (assets/fonts/, SIL OFL 1.1, see
 * LICENSES.txt there) so a build never depends on reaching Google Fonts;
 * Chinese text falls back to the system CJK fonts, as on LowBatteryTown.
 */

export const pressStart2P = localFont({
  src: "../assets/fonts/press-start-2p-latin-400-normal.woff2",
  weight: "400",
  display: "swap",
  variable: "--font-press-start-2p",
});

export const silkscreen = localFont({
  src: [
    { path: "../assets/fonts/silkscreen-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../assets/fonts/silkscreen-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  variable: "--font-silkscreen",
});

export const dotGothic16 = localFont({
  src: "../assets/fonts/dotgothic16-latin-400-normal.woff2",
  weight: "400",
  display: "swap",
  variable: "--font-dot-gothic-16",
});

export const vt323 = localFont({
  src: "../assets/fonts/vt323-latin-400-normal.woff2",
  weight: "400",
  display: "swap",
  variable: "--font-vt323",
});

export const notoSansTC = localFont({
  src: [
    { path: "../assets/fonts/noto-sans-tc-latin-300-normal.woff2", weight: "300", style: "normal" },
    { path: "../assets/fonts/noto-sans-tc-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../assets/fonts/noto-sans-tc-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../assets/fonts/noto-sans-tc-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  variable: "--font-noto-sans-tc",
  fallback: ["PingFang TC", "Noto Sans CJK TC", "Microsoft JhengHei", "sans-serif"],
});

export const fontVariables = [
  pressStart2P.variable,
  silkscreen.variable,
  dotGothic16.variable,
  vt323.variable,
  notoSansTC.variable,
].join(" ");
