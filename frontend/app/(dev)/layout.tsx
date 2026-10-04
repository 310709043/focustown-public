import "../globals.css";

import type { ReactNode } from "react";

import { fontVariables } from "@/lib/fonts";

/** Root layout for the locale-free dev tooling (sprite gallery). */
export default function DevLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={fontVariables}>
      <body>{children}</body>
    </html>
  );
}
