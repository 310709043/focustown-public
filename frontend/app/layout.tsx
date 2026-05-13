import "./globals.css";

import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Focus Town",
  description: "找你的人 · 找你的專注",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-TW">
      <body>
        <div className="grain-overlay" aria-hidden />
        <div className="vignette-overlay" aria-hidden />
        <div className="crt-overlay" aria-hidden />
        {children}
      </body>
    </html>
  );
}
