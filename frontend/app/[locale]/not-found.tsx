"use client";

import { useTranslations } from "next-intl";
import type { CSSProperties } from "react";

import { Link } from "@/i18n/routing";

/**
 * 404 inside a locale (e.g. /zh-TW/nowhere). It wears the LowBatteryTown
 * night colours and leads back to the town's front door, not into the
 * legacy Focus Town pages. URLs outside any locale use app/global-not-found.tsx.
 */
const page: CSSProperties = {
  position: "fixed",
  inset: 0,
  display: "grid",
  placeItems: "center",
  padding: 24,
  background: "#141c31",
  color: "#f9f4eb",
  fontFamily: 'system-ui, -apple-system, "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif',
  textAlign: "center",
};

export default function NotFound() {
  const t = useTranslations("lbt.notFound");

  return (
    <main role="alert" style={page}>
      <div>
        <p style={{ fontSize: 48, margin: 0, color: "#f8d779" }}>404</p>
        <h1 style={{ fontSize: 20, margin: "8px 0" }}>{t("title")}</h1>
        <p style={{ color: "#bdc8dc", margin: "0 0 20px", lineHeight: 1.6 }}>{t("body")}</p>
        <Link href="/" style={{ color: "#f4b49d" }}>
          {t("back")}
        </Link>
      </div>
    </main>
  );
}
