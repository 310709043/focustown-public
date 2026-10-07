"use client";

import { useTranslations } from "next-intl";

import { useLbtStore } from "@/lib/lbt/sessionStore";

import { TownSky } from "./Townscape";

export function EndView() {
  const t = useTranslations("lbt.end");
  const again = useLbtStore((s) => s.again);
  const goHome = useLbtStore((s) => s.goHome);
  const openModal = useLbtStore((s) => s.openModal);
  const endReason = useLbtStore((s) => s.endReason);

  return (
    <main className="view end-view">
      <div className="end-card">
        <TownSky />
        {/* The night moon, or a sun by day (<html data-lbt-time>). */}
        <div className="end-moon" aria-hidden="true">
          <svg className="by-time t-night end-crescent" viewBox="0 0 40 40" focusable="false">
            <path d="M24 4a17 17 0 1 0 12 26A14 14 0 1 1 24 4z" />
          </svg>
          <svg className="by-time t-dawn t-day t-dusk end-sun" viewBox="0 0 40 40" focusable="false">
            <circle cx="20" cy="20" r="11" />
          </svg>
        </div>
        <span className="eyebrow">{t("eyebrow")}</span>
        <h1 tabIndex={-1}>
          {/* The greeting follows the hour, like the home stage's streetlamp line. */}
          <span className="by-time t-dawn">{t("titleTopDawn")}</span>
          <span className="by-time t-day">{t("titleTopDay")}</span>
          <span className="by-time t-dusk">{t("titleTopDusk")}</span>
          <span className="by-time t-night">{t("titleTop")}</span>
          <br />
          {t("titleBottom")}
        </h1>
        <p className="end-reason">{t(`reason.${endReason ?? "unknown"}`)}</p>
        <p>
          {t("bodyTop")}
          <br />
          {t("bodyBottom")}
        </p>
        <div className="end-actions">
          <button type="button" className="primary-button" onClick={again}>
            {t("again")} <span aria-hidden="true">↗</span>
          </button>
          <button type="button" className="secondary-button" onClick={goHome}>
            {t("home")}
          </button>
          <button
            type="button"
            className="end-support-button"
            onClick={() => openModal({ type: "support" })}
          >
            {t("support")}
          </button>
        </div>
      </div>
    </main>
  );
}
