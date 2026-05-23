"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { Link, useRouter } from "@/i18n/routing";
import { sanitizeReturnTo } from "@/lib/routing/safeReturnTo";
import {
  AUTH_ERROR_NETWORK_FAILURE,
  AUTH_ERROR_UNKNOWN,
  useAuthStore,
} from "@/lib/state/authStore";
import { signUpSchema, type SignUpInput } from "@/lib/validation/auth";
import { PasswordInput } from "@/components/forms/PasswordInput";
import { AppFooter } from "@/components/AppFooter";
import { LEGAL } from "@/lib/config/legal";
import { LoginScene } from "@/components/login/LoginScene";
import { CornerDeco } from "@/components/login/CornerDeco";
import { BlinkDot } from "@/components/pixel/BlinkDot";

type FormErrors = Partial<Record<keyof SignUpInput, string>>;

function SignUpForm() {
  const router = useRouter();
  const search = useSearchParams();
  const returnTo = sanitizeReturnTo(search.get("returnTo"));
  const { signUp, loading, error } = useAuthStore();
  const [form, setForm] = useState<SignUpInput>({
    displayName: "",
    email: "",
    password: "",
    termsAccepted: false,
    marketingOptIn: false,
  });
  const [confirmPw, setConfirmPw] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const t = useTranslations("auth.signup");
  const tSplash = useTranslations("auth.splash");
  const tErr = useTranslations("common.errors");
  const errorText =
    error === AUTH_ERROR_NETWORK_FAILURE || error === AUTH_ERROR_UNKNOWN
      ? tErr(error)
      : error;

  const update = <K extends keyof SignUpInput>(key: K, value: SignUpInput[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = signUpSchema.safeParse(form);
    if (!parsed.success) {
      const fieldErrors: FormErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof SignUpInput;
        if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    try {
      await signUp({
        email: parsed.data.email,
        password: parsed.data.password,
        displayName: parsed.data.displayName,
        termsVersion: LEGAL.termsVersion,
        marketingOptIn: parsed.data.marketingOptIn,
      });
      // A new account always needs character selection before it can
      // engage with /town features, so route through /select-character
      // first. Preserve returnTo via query so the character page can
      // hand off to /u/<id> (or wherever the original share-link
      // pointed) once selection completes.
      const next = returnTo
        ? `/select-character?returnTo=${encodeURIComponent(returnTo)}`
        : "/select-character";
      router.push(next);
    } catch {
      /* error already in store */
    }
  };

  const signinHref = returnTo
    ? `/signin?returnTo=${encodeURIComponent(returnTo)}`
    : "/signin";

  return (
    <form
      data-testid="signup-form"
      onSubmit={onSubmit}
      className="pixel-panel login-form-anim relative"
      style={{
        width: "min(380px, calc(100vw - 32px))",
        padding: 20,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <CornerDeco color="var(--accent-2)" />

      <div
        className="font-silkscreen"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 11,
          color: "var(--ink-mute)",
          letterSpacing: "0.2em",
        }}
      >
        <BlinkDot color="var(--accent-2)" />
        <span>{tSplash("signUpTitle").toUpperCase()}</span>
      </div>

      <div>
        <Label>{t("displayNameLabel").toUpperCase()}</Label>
        <input
          data-testid="signup-name"
          placeholder={t("displayNamePlaceholder")}
          value={form.displayName}
          onChange={(e) => update("displayName", e.target.value)}
          className="pixel-input"
          autoComplete="nickname"
        />
        {errors.displayName ? (
          <ErrorLine>{errors.displayName}</ErrorLine>
        ) : null}
      </div>

      <div>
        <Label>{t("emailLabel").toUpperCase()}</Label>
        <input
          data-testid="signup-email"
          type="email"
          placeholder={t("emailPlaceholder")}
          value={form.email}
          onChange={(e) => update("email", e.target.value)}
          className="pixel-input"
          autoComplete="email"
        />
        {errors.email ? <ErrorLine>{errors.email}</ErrorLine> : null}
      </div>

      {/* Password + confirm: side-by-side on ≥ 400px form width, stack
          on narrower (zh form labels need more breathing room on phones). */}
      <div className="flex flex-col xs:flex-row" style={{ gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Label>{t("passwordLabel").toUpperCase()}</Label>
          <PasswordInput
            data-testid="signup-password"
            placeholder={t("passwordPlaceholder")}
            value={form.password}
            onChange={(e) => update("password", e.target.value)}
            autoComplete="new-password"
          />
          {errors.password ? <ErrorLine>{errors.password}</ErrorLine> : null}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Label>{t("confirmPasswordLabel").toUpperCase()}</Label>
          <PasswordInput
            placeholder={t("confirmPasswordPlaceholder")}
            value={confirmPw}
            onChange={(e) => setConfirmPw(e.target.value)}
            autoComplete="new-password"
          />
        </div>
      </div>

      <label
        className="font-silkscreen"
        style={{
          display: "inline-flex",
          alignItems: "flex-start",
          gap: 8,
          cursor: "pointer",
          fontSize: 10,
          color: "var(--ink-mute)",
          lineHeight: 1.6,
        }}
      >
        <PixelCheckbox
          testId="signup-terms"
          checked={form.termsAccepted}
          onClick={() => update("termsAccepted", !form.termsAccepted)}
        />
        <span>
          {t("termsAgreement")}{" "}
          <Link
            href="/legal/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent-2 underline hover:text-accent-1"
          >
            {t("termsLink")}
          </Link>{" "}
          {t("termsConnector")}{" "}
          <Link
            href="/legal/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent-2 underline hover:text-accent-1"
          >
            {t("privacyLink")}
          </Link>
        </span>
      </label>
      {errors.termsAccepted ? <ErrorLine>{errors.termsAccepted}</ErrorLine> : null}

      <label
        className="font-silkscreen"
        style={{
          display: "inline-flex",
          alignItems: "flex-start",
          gap: 8,
          cursor: "pointer",
          fontSize: 10,
          color: "var(--ink-mute)",
          lineHeight: 1.6,
        }}
      >
        <PixelCheckbox
          checked={form.marketingOptIn}
          onClick={() => update("marketingOptIn", !form.marketingOptIn)}
        />
        <span>{t("marketingOptIn")}</span>
      </label>

      {error ? (
        <div
          data-testid="signup-error"
          className="text-coral"
          style={{ fontSize: "var(--font-size-label)", lineHeight: 1.5 }}
        >
          {errorText}
        </div>
      ) : null}

      <button
        data-testid="signup-submit"
        type="submit"
        disabled={loading || !form.termsAccepted}
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
        <span>{loading ? t("loadingCta") : tSplash("next")}</span>
      </button>

      <div
        className="font-silkscreen text-center"
        style={{ fontSize: 10, color: "var(--ink-dim)" }}
      >
        {tSplash("haveAcc")}{" "}
        <Link href={signinHref} style={{ color: "var(--accent-3)" }}>
          {tSplash("backToSignin")} →
        </Link>
      </div>
    </form>
  );
}

export default function SignUpPage() {
  return (
    <LoginScene showHero topAlign>
      <Suspense fallback={null}>
        <SignUpForm />
      </Suspense>
      <AppFooter />
    </LoginScene>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="font-silkscreen"
      style={{
        fontSize: 10,
        color: "var(--ink-mute)",
        letterSpacing: "0.2em",
        marginBottom: 4,
      }}
    >
      {children}
    </div>
  );
}

function ErrorLine({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-coral mt-1"
      style={{ fontSize: "var(--font-size-note)" }}
    >
      {children}
    </p>
  );
}

function PixelCheckbox({
  checked,
  onClick,
  testId,
}: {
  checked: boolean;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <span
      data-testid={testId}
      role="checkbox"
      aria-checked={checked}
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          onClick();
        }
      }}
      style={{
        width: 14,
        height: 14,
        border: "1px solid var(--panel-stroke-strong)",
        background: checked ? "var(--accent)" : "rgba(0,0,0,0.4)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        flexShrink: 0,
        marginTop: 2,
      }}
    >
      {checked ? (
        <span style={{ color: "#0a0524", fontSize: 10, fontWeight: 700, lineHeight: 1 }}>
          ✓
        </span>
      ) : null}
    </span>
  );
}
