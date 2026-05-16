import { DotGothic16, Noto_Sans_TC, Press_Start_2P, Silkscreen, VT323 } from "next/font/google";

export const pressStart2P = Press_Start_2P({
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  variable: "--font-press-start-2p",
});

export const silkscreen = Silkscreen({
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
  variable: "--font-silkscreen",
});

export const dotGothic16 = DotGothic16({
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  variable: "--font-dot-gothic-16",
});

export const vt323 = VT323({
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  variable: "--font-vt323",
});

export const notoSansTC = Noto_Sans_TC({
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
  display: "swap",
  variable: "--font-noto-sans-tc",
});

export const fontVariables = [
  pressStart2P.variable,
  silkscreen.variable,
  dotGothic16.variable,
  vt323.variable,
  notoSansTC.variable,
].join(" ");
