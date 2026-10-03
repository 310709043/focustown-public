"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { REPORT_NOTE_MAX, REPORT_REASONS } from "@/lib/lbt/constants";
import { useLbtStore } from "@/lib/lbt/sessionStore";
import type { ReportReason } from "@/lib/lbt/types";

import { LbtModal } from "./LbtModal";

type Phase = "form" | "sending" | "sent" | "simulated";

/**
 * Report a conversation. Live: files a report (the server ends the chat
 * and never pairs the two again). Demo: says plainly that nothing is sent.
 * Crisis lines are always on screen.
 */
export function ReportModal() {
  const t = useTranslations("lbt.modal");
  const tNotice = useTranslations("lbt.notice");
  const closeModal = useLbtStore((s) => s.closeModal);
  const report = useLbtStore((s) => s.report);
  const mode = useLbtStore((s) => s.mode);
  const [reason, setReason] = useState<ReportReason>("harassment");
  const [note, setNote] = useState("");
  const [phase, setPhase] = useState<Phase>("form");
  const [failed, setFailed] = useState(false);

  const done = phase === "sent" || phase === "simulated";

  const submit = async () => {
    if (done) {
      closeModal();
      return;
    }
    setPhase("sending");
    setFailed(false);
    try {
      setPhase(await report(reason, note));
    } catch {
      setFailed(true);
      setPhase("form");
    }
  };

  return (
    <LbtModal
      eyebrow={t("report.eyebrow")}
      title={done ? t("report.sentTitle") : t("report.title")}
      confirmLabel={
        done ? t("gotIt") : phase === "sending" ? t("report.sending") : t("report.submit")
      }
      confirmDisabled={phase === "sending"}
      onConfirm={() => void submit()}
      onClose={closeModal}
    >
      {done ? (
        <p>{phase === "sent" ? t("report.sentBody") : t("report.sentBodyDemo")}</p>
      ) : (
        <>
          <p>{mode === "demo" ? t("report.introDemo") : t("report.intro")}</p>
          <fieldset className="report-reasons">
            <legend>{t("report.legend")}</legend>
            {REPORT_REASONS.map((value) => (
              <label key={value} className="report-reason">
                <input
                  type="radio"
                  name="report-reason"
                  value={value}
                  checked={reason === value}
                  onChange={() => setReason(value)}
                />
                <span>{t(`report.reasons.${value}`)}</span>
              </label>
            ))}
          </fieldset>
          <label className="report-note" htmlFor="lbt-report-note">
            <span>{t("report.noteLabel")}</span>
            <textarea
              id="lbt-report-note"
              rows={3}
              maxLength={REPORT_NOTE_MAX}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
          {failed ? (
            <p className="report-failed" role="alert">
              {tNotice("report_failed")}
            </p>
          ) : null}
        </>
      )}
      <p className="crisis-help">{t("report.help")}</p>
    </LbtModal>
  );
}

