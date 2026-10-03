"use client";

import { useTranslations } from "next-intl";

import { useLbtStore } from "@/lib/lbt/sessionStore";

/**
 * Real head count only: hidden when the transport has no honest number.
 * Live mode counts people connected to the town; the demo prototype counts
 * people who have the page open.
 */
export function TownCount() {
  const t = useTranslations("lbt.home");
  const town = useLbtStore((s) => s.town);
  const mode = useLbtStore((s) => s.mode);
  if (!town) return null;
  return (
    <p className="town-count" aria-live="polite">
      <span className="town-count-dot" aria-hidden="true" />
      <span>
        {mode === "demo"
          ? t("onlineDemo", { online: town.online })
          : t("online", { online: town.online })}
      </span>
      {mode === "live" && town.waiting > 0 ? (
        <span className="town-count-waiting">{t("waitingCount", { waiting: town.waiting })}</span>
      ) : null}
    </p>
  );
}
