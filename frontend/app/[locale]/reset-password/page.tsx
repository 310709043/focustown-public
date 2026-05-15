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
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <p
        className="text-muted mb-1"
        style={{
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
          className="text-coral"
          style={{ fontSize: "var(--font-size-label)", lineHeight: 1.5 }}
        >
          {serverError}
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
    <main
      className="absolute inset-0 flex flex-col items-center justify-center p-6"
      style={{
        background:
          "linear-gradient(155deg,#060120 0%,#0d0435 55%,#060120 100%)",
      }}
    >
      <div className="bg-card border border-border rounded-lg p-6 w-full max-w-sm">
        <div
          aria-hidden
          className="font-pixel text-[10px] tracking-widest text-center mb-2 opacity-80"
          style={{ color: "var(--a2)", textShadow: "0 0 10px var(--a1)" }}
        >
          ✦ FOCUS TOWN ✦
        </div>
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
        <Suspense fallback={<ResetPasswordFallback />}>
          <ResetPasswordInner />
        </Suspense>
      </div>
      <AppFooter />
    </main>
  );
}
