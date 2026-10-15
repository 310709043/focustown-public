"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";

import { remainingSeconds, useLbtStore } from "@/lib/lbt/sessionStore";

import { ByTime } from "./ByTime";

function PlugIcon() {
  return (
    <svg className="plug-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M9 2v5M15 2v5M6 7h12v4a6 6 0 0 1-12 0z M12 17v5" />
    </svg>
  );
}

/**
 * 再坐 7 分鐘？ Each side plugs into the lamp; the window grows only when
 * both have. Plugging in cannot be taken back (the server has no withdraw),
 * and saying good night stays possible at any time.
 */
export function PlugPanel() {
  const t = useTranslations("lbt.chat.plug");
  const titleId = useId();
  const hintId = useId();
  const extendMine = useLbtStore((s) => s.extendMine);
  const extendPartner = useLbtStore((s) => s.extendPartner);
  const simulated = useLbtStore((s) => s.simulated);
  const extend = useLbtStore((s) => s.extend);
  const remaining = useLbtStore(remainingSeconds);
  const lastMinute = remaining > 0 && remaining <= 60;

  const perTime = (key: "hint" | "hintPartner") => (
    <ByTime night={t(`${key}.lamp`)} day={t(`${key}.bench`)} />
  );
  const hint = extendMine
    ? t(simulated ? "hintPending" : "hintPendingLive")
    : perTime(extendPartner ? "hintPartner" : "hint");

  const state = extendMine ? "" : extendPartner ? " is-asked" : lastMinute ? " is-urgent" : "";

  return (
    <div
      className={`plug-panel${state}`}
      role="group"
      aria-labelledby={titleId}
    >
      <span id={titleId} className="plug-title">
        {t("title")}
      </span>
      <div className="plug-row">
        <button
          type="button"
          className="extend-button plug-chip"
          data-on={extendMine}
          disabled={extendMine}
          aria-describedby={hintId}
          onClick={extend}
        >
          <PlugIcon />
          {extendMine ? t("minePlugged") : t("mine")}
        </button>
        <span className="plug-chip is-partner" data-on={extendPartner}>
          <PlugIcon />
          {extendPartner ? t("partnerPlugged") : t("partner")}
        </span>
      </div>
      <p id={hintId} className="plug-hint" aria-live="polite">
        {hint}
      </p>
    </div>
  );
}
