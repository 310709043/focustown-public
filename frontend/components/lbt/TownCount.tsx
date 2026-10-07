"use client";

import { useTranslations } from "next-intl";

import { LIVE_COUNT_MIN } from "@/lib/lbt/constants";
import { useLbtStore } from "@/lib/lbt/sessionStore";

/**
 * Below 20 live visitors, show an open-town greeting instead of counts.
 * Hide the badge when status is unavailable or the live town is closed.
 * Live mode counts people connected to the town; the demo prototype counts
 * people who have the page open.
 */
export function TownCount() {
  const t = useTranslations("lbt.home");
  const town = useLbtStore((s) => s.town);
  const mode = useLbtStore((s) => s.mode);
  if (!town || (mode === "live" && !town.open)) return null;
  const showLiveCount = mode === "live" && town.online >= LIVE_COUNT_MIN;
  return (
    <p className="town-count" aria-live="polite">
      <span className="town-count-dot" aria-hidden="true" />
      <span>
        {mode === "demo"
          ? t("onlineDemo", { online: town.online })
          : showLiveCount
            ? t("online", { online: town.online })
            : t("openGreeting")}
      </span>
      {showLiveCount && town.waiting > 0 ? (
        <span className="town-count-waiting">{t("waitingCount", { waiting: town.waiting })}</span>
      ) : null}
    </p>
  );
}
