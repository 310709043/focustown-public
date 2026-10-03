import { DM_Mono, Nunito_Sans, Quicksand } from "next/font/google";

/**
 * Fonts for the LowBatteryTown surface only. Kept apart from lib/fonts.ts
 * so the pixel-city fonts are not preloaded here and these are not
 * preloaded on the legacy routes.
 */
export const nunitoSans = Nunito_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  display: "swap",
  variable: "--font-nunito-sans",
});

export const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
  variable: "--font-dm-mono",
});

/** Wordmark only: the closest open match to the LowBatteryTown logotype. */
export const quicksand = Quicksand({
  subsets: ["latin"],
  weight: ["700"],
  display: "swap",
  variable: "--font-quicksand",
});

export const lbtFontVariables = [nunitoSans.variable, dmMono.variable, quicksand.variable].join(" ");
