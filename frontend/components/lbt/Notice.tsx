"use client";

import { useTranslations } from "next-intl";

import { useLbtStore } from "@/lib/lbt/sessionStore";

const KNOWN = new Set([
  "invite_unavailable",
  "closed",
  "age_required",
  "slow_down",
  "time_up",
  "too_late",
  "empty_message",
  "already_in_conversation",
  "no_conversation",
  "nickname_required",
  "invalid_energy",
  "invalid_preference",
  "wait_interrupted",
  "report_failed",
]);

/** Inline, dismissible notice for the store's current error code. */
export function Notice() {
  const t = useTranslations("lbt.notice");
  const tModal = useTranslations("lbt.modal");
  const notice = useLbtStore((s) => s.notice);
  const dismiss = useLbtStore((s) => s.dismissNotice);
  if (!notice) return null;
  return (
    <div className="lbt-notice" role="alert">
      <span>{t(KNOWN.has(notice) ? notice : "generic")}</span>
      <button type="button" onClick={dismiss} aria-label={tModal("close")}>
        ×
      </button>
    </div>
  );
}
