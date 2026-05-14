"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { Link, useRouter } from "@/i18n/routing";
import { useAuthStore } from "@/lib/state/authStore";
import { PasswordInput } from "@/components/forms/PasswordInput";
import { AppFooter } from "@/components/AppFooter";
import { LocaleSwitcher } from "@/components/i18n/LocaleSwitcher";

export default function SignInPage() {
  const router = useRouter();
  const { signIn, loading, error } = useAuthStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const t = useTranslations("auth.signin");
  const tCommon = useTranslations("common");

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await signIn(email, password);
      router.push("/town");
    } catch {
      /* error already in store */
    }
  };

  return (
    <main
      className="absolute inset-0 flex flex-col items-center justify-center p-6"
      style={{
        background:
          "linear-gradient(155deg,#060120 0%,#0d0435 55%,#060120 100%)",
      }}
    >
      <div className="absolute top-4 right-4 z-10">
        <LocaleSwitcher className="flex gap-1 bg-glass border border-border rounded px-1 py-0.5 backdrop-blur-md" />
      </div>
      <form
        data-testid="signin-form"
        onSubmit={onSubmit}
        className="pixel-panel p-6 w-full max-w-sm flex flex-col gap-3"
      >
        {/* Decorative pixel marquee — kept tiny so it reads like a sign,
            not a heading. The real H1 sits below at section-title scale. */}
        <div
          aria-hidden
          className="font-pixel text-[10px] tracking-widest text-center mb-2 opacity-80"
          style={{ color: "var(--a2)", textShadow: "0 0 10px var(--a1)" }}
        >
          ✦ FOCUS TOWN ✦
        </div>
        <h1
          className="text-center mb-1"
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
        <p
          className="text-muted text-center mb-3"
          style={{
            fontSize: "var(--font-size-label)",
            lineHeight: "var(--line-height-body)",
          }}
        >
          {t("subtitle")}
        </p>
        <label className="sr-only" htmlFor="signin-email">
          {t("emailLabel")}
        </label>
        <input
          id="signin-email"
          data-testid="signin-email"
          type="email"
          required
          placeholder={t("emailPlaceholder")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="pixel-input"
          // Override .pixel-input's 13px so iOS Safari does not zoom on focus.
          style={{ fontSize: "var(--font-size-body)", lineHeight: 1.4 }}
          autoComplete="email"
        />
        <label className="sr-only" htmlFor="signin-password">
          {t("passwordLabel")}
        </label>
        <PasswordInput
          id="signin-password"
          data-testid="signin-password"
          required
          minLength={8}
          placeholder={t("passwordPlaceholder")}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
        {error ? (
          <div
            data-testid="signin-error"
            role="alert"
            className="font-japan"
            style={{
              fontSize: "var(--font-size-label)",
              lineHeight: 1.5,
              color: "#fecaca",
              background: "rgba(220,38,38,0.18)",
              border: "1px solid rgba(248,113,113,0.6)",
              borderRadius: 6,
              padding: "10px 12px",
              textShadow: "0 0 6px rgba(248,113,113,0.8)",
              boxShadow: "0 0 18px rgba(220,38,38,0.25)",
            }}
          >
            <span style={{ fontSize: 16, marginRight: 6 }}>✗</span>
            {error}
          </div>
        ) : null}
        <button
          data-testid="signin-submit"
          type="submit"
          disabled={loading}
          className="pixel-btn"
          style={{ fontSize: 12, padding: "10px 16px", letterSpacing: 2 }}
        >
          {loading ? t("loadingCta") : `${t("submitCta")} ▶`}
        </button>
        <div
          className="flex justify-between gap-3 mt-1"
          style={{ fontSize: "var(--font-size-label)" }}
        >
          <Link href="/signup" className="text-muted hover:text-accent-2">
            {t("toggleToSignup")}
          </Link>
          <Link
            href="/forgot-password"
            className="text-muted hover:text-accent-2"
          >
            {t("forgotPasswordLink")}
          </Link>
        </div>
        <span className="sr-only">{tCommon("buttons.signin")}</span>
      </form>
      <AppFooter />
    </main>
  );
}
