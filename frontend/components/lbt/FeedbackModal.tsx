"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { config } from "@/lib/config";
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_EMAIL_MAX,
  FEEDBACK_MAX,
  FeedbackError,
  type FeedbackCategory,
  type FeedbackErrorCode,
  submitFeedback,
} from "@/lib/lbt/feedback";
import { useLbtStore } from "@/lib/lbt/sessionStore";

import { LbtModal } from "./LbtModal";

type Phase = "form" | "sending" | "sent";

/**
 * Feedback box: a category, a message and an optional reply e-mail. The
 * owner reads entries in the admin console and their Google Sheet. The
 * hidden `website` field is a honeypot for bots.
 */
export function FeedbackModal() {
  const t = useTranslations("lbt.modal.feedback");
  const tModal = useTranslations("lbt.modal");
  const locale = useLocale();
  const closeModal = useLbtStore((s) => s.closeModal);
  const [category, setCategory] = useState<FeedbackCategory>("idea");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [phase, setPhase] = useState<Phase>("form");
  const [error, setError] = useState<FeedbackErrorCode | null>(null);

  const empty = message.trim() === "";

  const submit = async () => {
    if (phase === "sent") {
      closeModal();
      return;
    }
    if (empty) {
      setError("invalid_message");
      return;
    }
    setPhase("sending");
    setError(null);
    try {
      await submitFeedback(config.apiBaseUrl, {
        category,
        message,
        email,
        website,
        page: window.location.pathname,
        locale,
      });
      setPhase("sent");
    } catch (err) {
      setError(err instanceof FeedbackError ? err.code : "unknown");
      setPhase("form");
    }
  };

  return (
    <LbtModal
      eyebrow={t("eyebrow")}
      title={phase === "sent" ? t("sentTitle") : t("title")}
      confirmLabel={phase === "sent" ? tModal("gotIt") : phase === "sending" ? t("sending") : t("submit")}
      confirmDisabled={phase === "sending"}
      onConfirm={() => void submit()}
      onClose={closeModal}
    >
      {phase === "sent" ? (
        <p>{email.trim() ? t("sentBodyEmail") : t("sentBody")}</p>
      ) : (
        <>
          <p>{t("intro")}</p>
          <fieldset className="report-reasons">
            <legend>{t("legend")}</legend>
            {FEEDBACK_CATEGORIES.map((value) => (
              <label key={value} className="report-reason">
                <input
                  type="radio"
                  name="feedback-category"
                  value={value}
                  checked={category === value}
                  onChange={() => setCategory(value)}
                />
                <span>{t(`categories.${value}`)}</span>
              </label>
            ))}
          </fieldset>
          <label className="report-note" htmlFor="lbt-feedback-message">
            <span>{t("messageLabel")}</span>
            <textarea
              id="lbt-feedback-message"
              rows={4}
              maxLength={FEEDBACK_MAX}
              value={message}
              placeholder={t("messagePlaceholder")}
              onChange={(event) => setMessage(event.target.value)}
              aria-invalid={error === "invalid_message" || undefined}
            />
          </label>
          <div className="report-note">
            <label htmlFor="lbt-feedback-email">{t("emailLabel")}</label>
            <input
              id="lbt-feedback-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              maxLength={FEEDBACK_EMAIL_MAX}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-invalid={error === "invalid_email" || undefined}
              aria-describedby="lbt-feedback-email-hint"
            />
            <small id="lbt-feedback-email-hint">{t("emailHint")}</small>
          </div>
          <label className="feedback-hp" aria-hidden="true">
            Website
            <input
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={(event) => setWebsite(event.target.value)}
            />
          </label>
          {error ? (
            <p className="report-failed" role="alert">
              {t(`errors.${error}`)}
            </p>
          ) : null}
        </>
      )}
    </LbtModal>
  );
}
