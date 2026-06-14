import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LBT Admin",
  description: "Low Battery Town Admin Dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW">
      <body>{children}</body>
    </html>
  );
}
