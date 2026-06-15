"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Link, useRouter } from "@/i18n/routing";
import {
  AUTH_ERROR_NETWORK_FAILURE,
  AUTH_ERROR_UNKNOWN,
  useAuthStore,
} from "@/lib/state/authStore";
import { tokenStore } from "@/lib/api/client";
import { markAudioUnlocked } from "@/lib/audio/unlock";
import { trackSignIn } from "@/lib/analytics/events";
import { PasswordInput } from "@/components/forms/PasswordInput";
import { AdSlot } from "@/components/ads/AdSlot";
import { AD_SLOTS } from "@/lib/config/ads";
import { LoginScene } from "@/components/login/LoginScene";
import { CornerDeco } from "@/components/login/CornerDeco";
import { BlinkDot } from "@/components/pixel/BlinkDot";

/**
 * Landing splash — same scene + sign-in form as `/signin`, but with the
 * hero (logo + wordmark + tagline) shown above and the avatar strip
 * shown below. This is the page Search engines + first-time visitors
 * land on. Sign-in success routes to `/town`.
 */
export default function SplashPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { signIn, loading, error } = useAuthStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Redirect already-authenticated users straight to /town.
  useEffect(() => {
    if (user) {
      router.replace("/town");
      return;
    }
    const tokens = tokenStore.load();
    if (tokens) {
      void useAuthStore.getState().hydrate().then(() => {
        if (useAuthStore.getState().user) router.replace("/town");
      });
    }
  }, [user, router]);
  const t = useTranslations("auth.signin");
  const tSplash = useTranslations("auth.splash");
  const tErr = useTranslations("common.errors");
  const errorText =
    error === AUTH_ERROR_NETWORK_FAILURE || error === AUTH_ERROR_UNKNOWN
      ? tErr(error)
      : error;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    markAudioUnlocked();
    try {
      await signIn(email, password);
      trackSignIn();
      router.push("/town");
    } catch {
      /* error already in store */
    }
  };

  return (
    <LoginScene showHero showAvatarStrip showAboutPanel>
      <form
        data-testid="signin-form"
        onSubmit={onSubmit}
        aria-busy={loading || undefined}
        className="pixel-panel login-form-anim relative"
        style={{
          width: "min(380px, calc(100vw - 32px))",
          padding: 20,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <CornerDeco />

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

        <div>
          <Label>{t("emailLabel").toUpperCase()}</Label>
          <input
            data-testid="signin-email"
            type="email"
            required
            placeholder={tSplash("emailPlaceholder")}
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
            placeholder={tSplash("passwordPlaceholder")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
          <div
            className="font-silkscreen"
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginTop: 6,
              fontSize: 9,
              color: "var(--ink-dim)",
            }}
          >
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
            {errorText}
          </div>
        ) : null}

        <button
          data-testid="signin-submit"
          type="submit"
          disabled={loading}
          className="pixel-btn touch:min-h-[48px] disabled:opacity-60 disabled:cursor-not-allowed"
          style={{
            padding: "12px 18px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            fontSize: 13,
            background: "linear-gradient(180deg, #fbbf24 0%, #f59e0b 100%)",
            borderColor: "#f59e0b",
            color: "#1a0f2e",
            letterSpacing: "0.25em",
            textShadow: "none",
            boxShadow:
              "0 0 14px rgba(245,158,11,0.45), 0 0 28px rgba(245,158,11,0.25)",
          }}
        >
          {loading ? (
            <span aria-hidden className="inline-block animate-spin" style={{ fontSize: 14, lineHeight: 1 }}>
              ⟳
            </span>
          ) : (
            <span>✦</span>
          )}
          <span>{loading ? tSplash("loadingCta") : tSplash("signInTitle")}</span>
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
            data-testid="signup-link"
            href="/signup"
            style={{ color: "var(--accent)", textShadow: "var(--neon-glow)" }}
          >
            {tSplash("createAcc")} →
          </Link>
        </div>
      </form>
      {/* AdSense banner — only renders when NEXT_PUBLIC_ADSENSE_PUB_ID
          is configured. Sits between the form and the AboutTownPanel. */}
      <AdSlot
        slot={AD_SLOTS.loginBanner}
        format="horizontal"
        className="animate-fadeUpFast anim-delay-500"
        testId="ad-login-banner"
      />
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

