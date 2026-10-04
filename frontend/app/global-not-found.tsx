import type { Metadata } from "next";
import Link from "next/link";

/**
 * 404 for URLs no route matches. With one root layout per branch
 * ([locale], (dev)) there is no app/layout.tsx to wrap Next's default 404,
 * so this page renders its own document (experimental.globalNotFound).
 * Bilingual because the visitor's locale is unknown here.
 */
export const metadata: Metadata = {
  title: "404 · LowBatteryTown",
  robots: { index: false, follow: false },
};

const page = {
  minHeight: "100dvh",
  margin: 0,
  display: "grid",
  placeItems: "center",
  padding: 24,
  background: "#141c31",
  color: "#f9f4eb",
  fontFamily: 'system-ui, -apple-system, "PingFang TC", "Noto Sans TC", sans-serif',
  textAlign: "center" as const,
};

export default function GlobalNotFound() {
  return (
    <html lang="zh-TW">
      <body style={page}>
        <main>
          <p style={{ fontSize: 48, margin: 0, color: "#f8d779" }}>404</p>
          <h1 style={{ fontSize: 20, margin: "8px 0" }}>這條街還沒有燈。</h1>
          <p style={{ color: "#bdc8dc", margin: "0 0 20px" }} lang="en">
            This street has no lamp yet.
          </p>
          <Link href="/" style={{ color: "#f4b49d" }}>
            回到小鎮 · Back to the town
          </Link>
        </main>
      </body>
    </html>
  );
}
