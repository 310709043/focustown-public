import localFont from "next/font/local";

/**
 * Fonts for the LowBatteryTown surface only. Kept apart from lib/fonts.ts
 * so the pixel-city fonts are not preloaded here and these are not
 * preloaded on the legacy routes.
 *
 * Self-hosted (Latin subsets in assets/fonts/, SIL OFL 1.1, see
 * LICENSES.txt there) so a build never depends on reaching Google Fonts.
 */
export const nunitoSans = localFont({
  src: "../assets/fonts/nunito-sans-latin-wght-normal.woff2",
  weight: "200 1000",
  style: "normal",
  display: "swap",
  variable: "--font-nunito-sans",
  fallback: ["system-ui", "sans-serif"],
});

export const dmMono = localFont({
  src: [
    { path: "../assets/fonts/dm-mono-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../assets/fonts/dm-mono-latin-500-normal.woff2", weight: "500", style: "normal" },
  ],
  display: "swap",
  variable: "--font-dm-mono",
  fallback: ["ui-monospace", "monospace"],
});

/** Wordmark only: the closest open match to the LowBatteryTown logotype. */
export const quicksand = localFont({
  src: "../assets/fonts/quicksand-latin-700-normal.woff2",
  weight: "700",
  style: "normal",
  display: "swap",
  variable: "--font-quicksand",
  fallback: ["system-ui", "sans-serif"],
});

export const lbtFontVariables = [nunitoSans.variable, dmMono.variable, quicksand.variable].join(" ");
