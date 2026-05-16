"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { Link, useRouter } from "@/i18n/routing";
import { authApi } from "@/lib/api/endpoints";
import { ApiError } from "@/lib/api/client";
import { resetPasswordSchema, type ResetPasswordInput } from "@/lib/validation/auth";
import { PasswordInput } from "@/components/forms/PasswordInput";
import { AppFooter } from "@/components/AppFooter";
import { LoginScene } from "@/components/login/LoginScene";

type FormErrors = Partial<Record<keyof ResetPasswordInput, string>>;

function ResetPasswordInner() {
  const router = useRouter();
  const search = useSearchParams();
  const token = search.get("token") ?? "";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const t = useTranslations("auth.reset");

  if (!token) {
    return (
      <div
        className="text-text"
        style={{
          fontSize: "var(--font-size-body)",
          lineHeight: "var(--line-height-body)",
        }}
      >
        <p className="mb-3">{t("invalidTokenMessage")}</p>
        <Link
          href="/forgot-password"
          className="text-accent-2 hover:text-accent-1 active:text-accent-1 touch:inline-block touch:py-2"
          style={{ fontSize: "var(--font-size-label)" }}
        >
          {t("requestAgain")}
        </Link>
      </div>
    );
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setServerError(null);

    const parsed = resetPasswordSchema.safeParse({
      token,
      newPassword,
      confirmPassword,
    });
    if (!parsed.success) {
      const fieldErrors: FormErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof ResetPasswordInput;
        if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setSubmitting(true);
    try {
      await authApi.resetPassword({
        token,
        newPassword: parsed.data.newPassword,
      });
      setDone(true);
      setTimeout(() => router.push("/signin"), 1800);
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.code === "validation_error") {
          setServerError(t("validationError"));
        } else if (e.status === 429) {
          setServerError(t("rateLimited"));
        } else {
          setServerError(e.message || t("fallbackError"));
        }
      } else {
        setServerError(t("fallbackError"));
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div
        className="text-text text-center"
        style={{
          fontSize: "var(--font-size-body)",
          lineHeight: "var(--line-height-body)",
        }}
      >
        <p
          className="mb-3 text-accent-2"
          style={{ fontSize: "var(--font-size-body-lg)" }}
        >
          {t("successHeading")}
        </p>
        <p
          className="text-muted"
          style={{ fontSize: "var(--font-size-note)" }}
        >
          {t("successRedirect")}
        </p>
      </div>
    );
  }

  return (
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
        {t("intro")}
      </p>
      <div>
        <PasswordInput
          placeholder={t("newPasswordPlaceholder")}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          autoComplete="new-password"
        />
        {errors.newPassword ? (
          <p
            className="text-coral mt-1"
            style={{ fontSize: "var(--font-size-note)" }}
          >
            {errors.newPassword}
          </p>
        ) : null}
      </div>
      <div>
        <PasswordInput
          placeholder={t("confirmPlaceholder")}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
        />
        {errors.confirmPassword ? (
          <p
            className="text-coral mt-1"
            style={{ fontSize: "var(--font-size-note)" }}
          >
            {errors.confirmPassword}
          </p>
        ) : null}
      </div>
      {serverError ? (
        <div
          role="alert"
          className="text-coral"
          style={{ fontSize: "var(--font-size-label)", lineHeight: 1.5 }}
        >
          {serverError}
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
        style={{ color: "var(--ink-mute)", fontSize: 10, textDecoration: "none" }}
      >
        {t("backToSigninShort")}
      </Link>
    </form>
  );
}

function ResetPasswordFallback() {
  const t = useTranslations("auth.reset");
  return (
    <div
      className="text-muted"
      style={{ fontSize: "var(--font-size-label)" }}
    >
      {t("loadingPage")}
    </div>
  );
}

export default function ResetPasswordPage() {
  const t = useTranslations("auth.reset");
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
        <Suspense fallback={<ResetPasswordFallback />}>
          <ResetPasswordInner />
        </Suspense>
      </div>
      <AppFooter />
    </LoginScene>
  );
}
