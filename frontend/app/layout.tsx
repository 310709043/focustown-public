import "./globals.css";

import type { Metadata } from "next";
import type { ReactNode } from "react";

import { DirectionSync } from "@/components/chrome/DirectionSync";
import { SplashGate } from "@/components/chrome/SplashGate";

export const metadata: Metadata = {
  title: "Focus Town",
  description: "找你的人 · 找你的專注",
  icons: {
    // Browser tab favicon. logo.svg scales at every dpi without rasterising.
    icon: [
      { url: "/logo.svg", type: "image/svg+xml" },
      { url: "/logo.png", type: "image/png" },
    ],
    apple: "/logo.png",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-TW">
      <body>
        <div className="grain-overlay" aria-hidden />
        <div className="vignette-overlay" aria-hidden />
        <div className="crt-overlay" aria-hidden />
        <DirectionSync />
        <SplashGate />
        {children}
      </body>
    </html>
  );
}
