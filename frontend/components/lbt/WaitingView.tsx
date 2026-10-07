"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { ENERGY_ID, LONG_WAIT_MS } from "@/lib/lbt/constants";
import { useChimeStore } from "@/lib/lbt/chimeStore";
import { useLbtStore } from "@/lib/lbt/sessionStore";

import { ChimeToggle } from "./ChimeToggle";
import { Notice } from "./Notice";
import { TownSky } from "./Townscape";

export function WaitingView() {
  const t = useTranslations("lbt");
  const chimeOn = useChimeStore((s) => s.enabled);
  const energy = useLbtStore((s) => s.energy);
  const cancelWaiting = useLbtStore((s) => s.cancelWaiting);
  const mode = useLbtStore((s) => s.mode);
  const connection = useLbtStore((s) => s.connection);
  const waitingSince = useLbtStore((s) => s.waitingSince);
  const invitation = useLbtStore((s) => s.companionInvitation);
  const answering = useLbtStore((s) => s.companionAnswering);
  const answerCompanion = useLbtStore((s) => s.answerCompanion);
  const [longWait, setLongWait] = useState(false);

  useEffect(() => {
    if (waitingSince === null) return;
    const left = LONG_WAIT_MS - (Date.now() - waitingSince);
    if (left <= 0) {
      setLongWait(true);
      return;
    }
    const timer = setTimeout(() => setLongWait(true), left);
    return () => clearTimeout(timer);
  }, [waitingSince]);

  return (
    <main className="view waiting-view" aria-live="polite">
      <div className="waiting-card">
        <TownSky />
        <div className="waiting-lamp" aria-hidden="true">
          <span />
        </div>
        <p className="eyebrow">{t("waiting.eyebrow")}</p>
        <h1 tabIndex={-1}>
          {/* the first line follows the hour (<html data-lbt-time>) */}
          <span className="by-time t-dawn">{t("waiting.titleTopDawn")}</span>
          <span className="by-time t-day">{t("waiting.titleTopDay")}</span>
          <span className="by-time t-dusk">{t("waiting.titleTopDusk")}</span>
          <span className="by-time t-night">{t("waiting.titleTop")}</span>
          <br />
          {t("waiting.titleBottom")}
        </h1>
        <p>
          {t("waiting.yourEnergy", {
            energy: t(`energy.${ENERGY_ID[energy]}.name`),
          })}
          <br />
          {t("waiting.breathe")}
        </p>
        {mode === "live" ? <p className="waiting-town">{t("waiting.searching")}</p> : null}
        {connection === "offline" ? (
          <p className="waiting-offline" role="status">
            {t("waiting.offline")}
          </p>
        ) : null}
        {longWait && mode === "live" ? (
          <p className="waiting-long">{t("waiting.longWait")}</p>
        ) : null}
        {invitation ? (
          <section
            className="companion-invitation"
            aria-labelledby="companion-title"
          >
            <h2 id="companion-title">{t("companion.inviteTitle")}</h2>
            {invitation.nickname ? <p>{invitation.nickname}</p> : null}
            <p>{t("companion.inviteBody")}</p>
            <div className="companion-actions">
              <button
                type="button"
                className="primary-button"
                disabled={answering || connection !== "open"}
                onClick={() => answerCompanion(true)}
              >
                {answering ? t("companion.answering") : t("companion.accept")}
              </button>
              <button
                type="button"
                className="text-button"
                disabled={answering || connection !== "open"}
                onClick={() => answerCompanion(false)}
              >
                {t("companion.decline")}
              </button>
            </div>
          </section>
        ) : null}
        <Notice />
        <div className="waiting-progress">
          <span />
        </div>
        <p className="waiting-cue">
          {t(chimeOn ? "cues.waitingOn" : "cues.waitingOff")} <ChimeToggle />
        </p>
        <button type="button" className="text-button" onClick={cancelWaiting}>
          {t("waiting.cancel")}
        </button>
      </div>
    </main>
  );
}
