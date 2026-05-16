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
        className="pixel-panel login-form-anim p-6 w-full max-w-sm relative"
        style={{ width: 380 }}
      >
        <h1
          className="text-center mb-3"
          style={{
            fontSize: "var(--font-size-section-title)",
            lineHeight: "var(--line-height-title)",
            fontWeight: 500,
            color: "var(--text)",
            textShadow: "0 0 18px rgba(167,139,250,0.35)",
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
            }}
          >
            <p className="mb-2">{t("successMessage")}</p>
            <p
              className="text-muted mb-4"
              style={{
                fontSize: "var(--font-size-note)",
                lineHeight: 1.6,
              }}
            >
              {t("linkExpiryNote")}
            </p>
            <Link
              href="/signin"
              className="block text-accent-2 hover:text-accent-1 active:text-accent-1 text-center touch:py-2"
              style={{ fontSize: "var(--font-size-label)" }}
            >
              {t("backToSignin")}
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            <p
              className="text-muted mb-1"
              style={{
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
              className="bg-[rgba(12,5,35,.9)] border border-border rounded px-3 py-2 outline-none focus:border-accent-1"
              style={{ fontSize: "var(--font-size-body)", lineHeight: 1.4 }}
              autoComplete="email"
            />
            {error ? (
              <div
                className="text-coral"
                style={{ fontSize: "var(--font-size-label)", lineHeight: 1.5 }}
              >
                {error}
              </div>
            ) : null}
            <button
              type="submit"
              disabled={submitting}
              className="font-pixel border-2 border-accent-1 text-accent-1 py-2.5 rounded hover:border-accent-2 active:border-accent-2 active:bg-accent-1/10 touch:min-h-[48px] disabled:opacity-50 tracking-widest"
              style={{ fontSize: "var(--font-size-label)", lineHeight: 1.2 }}
            >
              {submitting ? t("loadingCta") : t("submitCta")}
            </button>
            <Link
              href="/signin"
              className="text-muted hover:text-accent-2 active:text-accent-2 text-center touch:py-2 touch:-my-2"
              style={{ fontSize: "var(--font-size-label)" }}
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
