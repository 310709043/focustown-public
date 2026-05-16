"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Modal } from "./Modal";

type Submitted = { kind: "idle" } | { kind: "ok" } | { kind: "err"; msg: string };

/**
 * Support modal — 480px form (subject + body + submit) with help-channel
 * sublines (email + docs link). Backend endpoint pending; submission logs
 * to console and shows a success state.
 */
export function SupportModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("town.modals.support");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [state, setState] = useState<Submitted>({ kind: "idle" });

  useEffect(() => {
    if (!open) {
      setSubject("");
      setBody("");
      setState({ kind: "idle" });
    }
  }, [open]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) {
      setState({ kind: "err", msg: t("emptyError") });
      return;
    }
    setState({ kind: "ok" });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("title")}
      accent="var(--accent-1)"
      width="min(480px, 92vw)"
      testId="support-modal"
    >
      {state.kind === "ok" ? (
        <div className="flex flex-col items-center gap-4 py-6">
          <div className="text-4xl">✉</div>
          <div className="font-pixel text-[10px] text-accent-2 text-center">
            {t("successHeading")}
          </div>
          <div className="text-[11px] text-muted text-center">{t("successBody")}</div>
          <button
            onClick={onClose}
            className="pixel-btn"
            style={{ fontSize: 10, padding: "8px 16px", letterSpacing: 2 }}
          >
            {t("doneCta")}
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div
            className="text-[11px] text-muted leading-relaxed"
            style={{ background: "rgba(124,58,237,0.05)", padding: 10, borderRadius: 4 }}
          >
            {t("helpHint")}
          </div>
          <label className="text-[10px] text-muted tracking-wide">
            {t("subjectLabel")}
          </label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder={t("subjectPlaceholder")}
            className="pixel-panel font-body"
            style={{
              padding: "8px 10px",
              fontSize: 13,
              background: "rgba(7,4,26,0.6)",
              color: "var(--text)",
              outline: "none",
            }}
          />
          <label className="text-[10px] text-muted tracking-wide">
            {t("bodyLabel")}
          </label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t("bodyPlaceholder")}
            rows={6}
            className="pixel-panel font-body"
            style={{
              padding: "10px",
              fontSize: 13,
              lineHeight: 1.5,
              background: "rgba(7,4,26,0.6)",
              color: "var(--text)",
              outline: "none",
              resize: "vertical",
            }}
          />
          {state.kind === "err" ? (
            <div className="text-[11px] text-coral">{state.msg}</div>
          ) : null}
          <div className="flex justify-end gap-2 mt-2">
            <button
              type="button"
              onClick={onClose}
              className="pixel-btn"
              style={{
                fontSize: 10,
                padding: "8px 14px",
                letterSpacing: 2,
                background: "transparent",
                color: "var(--muted)",
                borderColor: "var(--dim)",
                boxShadow: "none",
                textShadow: "none",
              }}
            >
              {t("cancelCta")}
            </button>
            <button
              type="submit"
              className="pixel-btn primary"
              style={{ fontSize: 10, padding: "8px 16px", letterSpacing: 2 }}
            >
              {t("submitCta")}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
