"use client";

import { useTranslations } from "next-intl";

import { Link } from "@/i18n/routing";

/**
 * Rendered when the API returns 404 for an unknown room id. Kept dead
 * simple — a single emoji + one-line message — so it can't be mistaken
 * for a permission-denied state.
 */
export function MissingRoom() {
  const t = useTranslations("town.room.missing");
  return (
    <main className="absolute inset-0 grid place-items-center bg-bg">
      <div className="font-japan text-muted text-center">
        <div style={{ fontSize: 28 }}>🚪</div>
        <div style={{ fontSize: 13, marginTop: 10 }}>{t("title")}</div>
        <Link
          href="/town"
          className="font-japan text-amber hover:text-text transition-colors"
          style={{ fontSize: 12, marginTop: 16, display: "inline-block" }}
        >
          {t("backLink")}
        </Link>
      </div>
    </main>
  );
}
