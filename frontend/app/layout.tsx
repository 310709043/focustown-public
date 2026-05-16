import "./globals.css";

import type { Viewport } from "next";
import type { ReactNode } from "react";

import { fontVariables } from "@/lib/fonts";

/**
 * Root shell. Next.js requires exactly one root layout that renders
 * `<html>` + `<body>`. The post-i18n tree splits routes between
 * `[locale]/*` (locale-bound shell with intl provider) and `(dev)/*`
 * (gallery + tooling, locale-free). Both branch off this shared root.
 *
 * `lang` defaults to the next-intl default locale; the locale layout
 * updates `document.documentElement.lang` client-side via DirectionSync
 * so SEO crawlers and screen readers see the active language without us
 * pushing dynamic params up to the root tree (which Next 15 forbids).
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#030111",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-TW" className={fontVariables}>
      <body>{children}</body>
    </html>
  );
}
