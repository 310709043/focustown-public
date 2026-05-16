"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { Link, useRouter } from "@/i18n/routing";
import { useAuthStore } from "@/lib/state/authStore";
import { PasswordInput } from "@/components/forms/PasswordInput";
import { AppFooter } from "@/components/AppFooter";
import { LoginScene } from "@/components/login/LoginScene";
import { CornerDeco } from "@/components/login/CornerDeco";
import { SsoButtons } from "@/components/login/SsoButtons";
import { BlinkDot } from "@/components/pixel/BlinkDot";

export default function SignInPage() {
  const router = useRouter();
  const { signIn, loading, error } = useAuthStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const t = useTranslations("auth.signin");
  const tSplash = useTranslations("auth.splash");

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
    <LoginScene showHero showAvatarStrip>
      <form
        data-testid="signin-form"
        onSubmit={onSubmit}
        className="pixel-panel login-form-anim relative"
        style={{
          width: 380,
          padding: 20,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <CornerDeco />

        {/* Header dot + title — matches reference's "✦ ENTER TOWN" line. */}
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
          <BlinkDot color="var(--accent-3)" />
          <span>{tSplash("signInTitle").toUpperCase()}</span>
        </div>

        <SsoButtons disabled={loading} />

        <Divider label={tSplash("or")} />

        <div>
          <Label>{t("emailLabel").toUpperCase()}</Label>
          <input
            data-testid="signin-email"
            type="email"
            required
            placeholder={t("emailPlaceholder")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            readOnly={loading}
            className="pixel-input"
            autoComplete="email"
          />
        </div>

        <div>
          <Label>{t("passwordLabel").toUpperCase()}</Label>
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
          <div
            className="font-silkscreen"
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: 6,
              fontSize: 9,
              color: "var(--ink-dim)",
            }}
          >
            <label
              style={{
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <PixelCheckbox checked={remember} onClick={() => setRemember(!remember)} />
              <span>{tSplash("rememberMe")}</span>
            </label>
            <Link
              href="/forgot-password"
              className="hover:text-accent-2"
              style={{ cursor: "pointer", color: "var(--ink-dim)" }}
            >
              {t("forgotPasswordLink")}
            </Link>
          </div>
        </div>

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
          className="pixel-btn primary touch:min-h-[48px]"
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
          <span>{loading ? t("loadingCta") : tSplash("signInTitle")}</span>
        </button>

        <div
          className="font-silkscreen text-center"
          style={{
            fontSize: 10,
            color: "var(--ink-dim)",
            marginTop: 4,
          }}
        >
          {tSplash("newHere")}{" "}
          <Link
            href="/signup"
            style={{ color: "var(--accent)", textShadow: "var(--neon-glow)" }}
          >
            {tSplash("createAcc")} →
          </Link>
        </div>
      </form>
      <AppFooter />
    </LoginScene>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div
      className="font-silkscreen"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        color: "var(--ink-dim)",
        fontSize: 9,
      }}
    >
      <div style={{ flex: 1, height: 1, background: "var(--panel-stroke)" }} />
      <span>{label}</span>
      <div style={{ flex: 1, height: 1, background: "var(--panel-stroke)" }} />
    </div>
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

function PixelCheckbox({
  checked,
  onClick,
}: {
  checked: boolean;
  onClick: () => void;
}) {
  return (
    <span
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
