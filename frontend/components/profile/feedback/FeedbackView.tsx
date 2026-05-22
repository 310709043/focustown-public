"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { ApiError } from "@/lib/api/client";
import { feedbackApi, type FeedbackCategory } from "@/lib/api/endpoints";

const CATEGORIES: FeedbackCategory[] = ["bug", "suggestion", "praise", "other"];

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";

type Submitted =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "ok" }
  | { kind: "err"; msg: string };

interface FeedbackViewProps {
  onClose: () => void;
}

export function FeedbackView({ onClose }: FeedbackViewProps) {
  const t = useTranslations("town.modals.feedback");
  const tModal = useTranslations("profile.modal");
  const locale = useLocale();
  const [category, setCategory] = useState<FeedbackCategory>("suggestion");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [contact, setContact] = useState("");
  const [state, setState] = useState<Submitted>({ kind: "idle" });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (state.kind === "submitting") return;
    if (!body.trim()) {
      setState({ kind: "err", msg: t("emptyError") });
      return;
    }
    setState({ kind: "submitting" });
    const composed = subject.trim()
      ? `[${subject.trim()}] ${body.trim()}`
      : body.trim();
    try {
      await feedbackApi.submit({
        category,
        body: composed,
        contact_email: contact.trim() || null,
        locale,
        app_version: APP_VERSION,
        context:
          typeof window !== "undefined"
            ? {
                url: window.location.pathname,
                user_agent: window.navigator.userAgent.slice(0, 200),
              }
            : null,
      });
      setState({ kind: "ok" });
    } catch (err: unknown) {
      const isRateLimited = err instanceof ApiError && err.status === 429;
      setState({
        kind: "err",
        msg: isRateLimited ? t("rateLimitedError") : t("failureGeneric"),
      });
    }
  }

  return (
    <div
      data-testid="profile-feedback-view"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 14,
        padding: "20px 24px",
        overflowY: "auto",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span
          className="font-silkscreen"
          style={{
            fontSize: 12,
            letterSpacing: "0.32em",
            color: "var(--teal)",
          }}
        >
          ✦ {t("title")}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label={tModal("closeAria")}
          className="font-silkscreen"
          style={{
            padding: "6px 12px",
            fontSize: 11,
            letterSpacing: "0.25em",
            color: "var(--ink-mute)",
            background: "transparent",
            border: "1px solid var(--panel-stroke)",
            cursor: "pointer",
          }}
        >
          ✕ {tModal("close")}
        </button>
      </header>

      {state.kind === "ok" ? (
        <div className="flex flex-col items-center gap-4 py-8">
          <div className="text-4xl">✦</div>
          <div className="font-pixel text-[10px] text-teal text-center">
            {t("successHeading")}
          </div>
          <div className="text-[11px] text-muted text-center">
            {t("successBody")}
          </div>
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
          <label className="text-[10px] text-muted tracking-wide">
            {t("categoryLabel")}
          </label>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button
                type="button"
                key={c}
                data-testid={`feedback-category-${c}`}
                onClick={() => setCategory(c)}
                className="font-silkscreen"
                style={{
                  padding: "6px 12px",
                  fontSize: 10,
                  letterSpacing: "0.18em",
                  color: category === c ? "#0c0524" : "var(--ink-mute)",
                  background:
                    category === c
                      ? "var(--accent-3)"
                      : "rgba(20,10,55,0.55)",
                  border: "1px solid var(--panel-stroke)",
                  cursor: "pointer",
                }}
              >
                {t(`category${c.charAt(0).toUpperCase()}${c.slice(1)}`)}
              </button>
            ))}
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
            rows={5}
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

          <label className="text-[10px] text-muted tracking-wide">
            {t("contactLabel")}
          </label>
          <input
            type="email"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder={t("contactPlaceholder")}
            className="pixel-panel font-body"
            style={{
              padding: "8px 10px",
              fontSize: 13,
              background: "rgba(7,4,26,0.6)",
              color: "var(--text)",
              outline: "none",
            }}
          />

          {state.kind === "err" ? (
            <div className="text-[11px] text-coral">{state.msg}</div>
          ) : null}
          <div className="flex justify-end gap-2 mt-2">
            <button
              type="submit"
              disabled={state.kind === "submitting"}
              className="pixel-btn primary disabled:opacity-60 disabled:cursor-not-allowed"
              style={{
                fontSize: 10,
                padding: "8px 16px",
                letterSpacing: 2,
              }}
            >
              {state.kind === "submitting"
                ? t("submittingCta")
                : t("submitCta")}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
