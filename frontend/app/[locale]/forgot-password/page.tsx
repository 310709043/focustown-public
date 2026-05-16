"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/routing";
import { authApi } from "@/lib/api/endpoints";
import { ApiError } from "@/lib/api/client";
import { forgotPasswordSchema } from "@/lib/validation/auth";
import { AppFooter } from "@/components/AppFooter";
import { LoginScene } from "@/components/login/LoginScene";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const t = useTranslations("auth.forgot");

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t("invalidEmail"));
      return;
    }
    setSubmitting(true);
    try {
      await authApi.forgotPassword({ email: parsed.data.email });
      setSubmitted(true);
    } catch (e) {
      // Even on backend error, present a generic message to avoid enumeration.
      if (e instanceof ApiError && e.status === 429) {
        setError(t("rateLimited"));
      } else {
        setSubmitted(true);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <LoginScene showHero={false}>
      <div
        className="pixel-panel login-form-anim relative"
        style={{
          width: 380,
          padding: 20,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <h1
          className="font-silkscreen text-center"
          style={{
            fontSize: 13,
            letterSpacing: "0.2em",
            color: "var(--accent-2)",
            textShadow: "0 0 12px var(--accent-2)",
            margin: 0,
          }}
        >
          {t("title")}
        </h1>

        {submitted ? (
          <div
            className="text-text"
            style={{
              fontSize: "var(--font-size-body)",
              lineHeight: "var(--line-height-body)",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <p>{t("successMessage")}</p>
            <p
              className="text-muted"
              style={{
                fontSize: "var(--font-size-note)",
                lineHeight: 1.6,
              }}
            >
              {t("linkExpiryNote")}
            </p>
            <Link
              href="/signin"
              className="font-silkscreen text-center"
              style={{
                color: "var(--accent)",
                textShadow: "var(--neon-glow)",
                fontSize: 10,
                marginTop: 6,
              }}
            >
              {t("backToSignin")}
            </Link>
          </div>
        ) : (
          <form
            onSubmit={onSubmit}
            style={{ display: "flex", flexDirection: "column", gap: 12 }}
          >
            <p
              style={{
                color: "var(--ink-mute)",
                fontSize: "var(--font-size-label)",
                lineHeight: "var(--line-height-body)",
              }}
            >
              {t("instructionsShort")}
            </p>
            <input
              type="email"
              required
              placeholder={t("emailPlaceholder")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pixel-input"
              autoComplete="email"
            />
            {error ? (
              <div
                role="alert"
                className="text-coral"
                style={{ fontSize: "var(--font-size-label)", lineHeight: 1.5 }}
              >
                {error}
              </div>
            ) : null}
            <button
              type="submit"
              disabled={submitting}
              className="pixel-btn primary touch:min-h-[48px] disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                padding: "12px 18px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                fontSize: 13,
              }}
            >
              <span>✦</span>
              <span>{submitting ? t("loadingCta") : t("submitCta")}</span>
            </button>
            <Link
              href="/signin"
              className="font-silkscreen text-center"
              style={{
                color: "var(--ink-mute)",
                fontSize: 10,
                textDecoration: "none",
              }}
            >
              {t("backToSigninShort")}
            </Link>
          </form>
        )}
      </div>
      <AppFooter />
    </LoginScene>
  );
}
