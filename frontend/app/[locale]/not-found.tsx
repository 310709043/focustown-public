"use client";

import { useTranslations } from "next-intl";

import { Link } from "@/i18n/routing";

export default function NotFound() {
  const t = useTranslations("errors");

  return (
    <main
      role="alert"
      className="min-h-screen flex flex-col items-center justify-center px-6 text-center"
      style={{ background: "var(--bg)", color: "var(--text)" }}
    >
      <div
        className="pixel-panel"
        style={{ padding: 32, maxWidth: 420, display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}
      >
        <span className="font-silkscreen" style={{ fontSize: 48, color: "var(--accent)" }}>
          404
        </span>
        <h1 className="font-silkscreen" style={{ fontSize: 14, color: "var(--text)", letterSpacing: "0.1em" }}>
          {t("not_found")}
        </h1>
        <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>
          {t("generic.server")}
        </p>
        <Link
          href="/town"
          className="pixel-btn primary"
          style={{ padding: "10px 24px", fontSize: 12, textDecoration: "none" }}
        >
          {t("generic.back_to_town")}
        </Link>
      </div>
    </main>
  );
}
