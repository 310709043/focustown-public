"use client";

import { useTranslations } from "next-intl";

import { ENERGY_ID } from "@/lib/lbt/constants";
import { useLbtStore } from "@/lib/lbt/sessionStore";

export function WaitingView() {
  const t = useTranslations("lbt");
  const energy = useLbtStore((s) => s.energy);
  const goHome = useLbtStore((s) => s.goHome);

  return (
    <main className="view waiting-view" aria-live="polite">
      <div className="waiting-card">
        <div className="waiting-lamp" aria-hidden="true">
          <span />
        </div>
        <p className="eyebrow">{t("waiting.eyebrow")}</p>
        <h1 tabIndex={-1}>
          {t("waiting.titleTop")}
          <br />
          {t("waiting.titleBottom")}
        </h1>
        <p>
          {t("waiting.yourEnergy", { energy: t(`energy.${ENERGY_ID[energy]}.name`) })}
          <br />
          {t("waiting.breathe")}
        </p>
        <div className="waiting-progress">
          <span />
        </div>
        <button type="button" className="text-button" onClick={goHome}>
          {t("waiting.cancel")}
        </button>
      </div>
    </main>
  );
}
