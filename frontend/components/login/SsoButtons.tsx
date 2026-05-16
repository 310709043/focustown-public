"use client";

import { useTranslations } from "next-intl";

/**
 * Three SSO buttons ported from `reference/screen-login.jsx`: Google
 * (primary white), GitHub + Apple (compact pair). Visual only —
 * `onProvider` is a no-op stub today, because OAuth wiring lives in a
 * separate task; the panel is presentational until that lands.
 */
interface SsoButtonsProps {
  onProvider?: (provider: "google" | "github" | "apple") => void;
  disabled?: boolean;
}

export function SsoButtons({ onProvider, disabled }: SsoButtonsProps) {
  const t = useTranslations("auth.splash");
  const click = (p: "google" | "github" | "apple") => () => {
    if (disabled) return;
    onProvider?.(p);
  };

  return (
    <>
      <button
        type="button"
        onClick={click("google")}
        disabled={disabled}
        className="pixel-btn"
        style={{
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          background: "#fff",
          color: "#0a0524",
          borderColor: "#fff",
          fontWeight: 700,
        }}
      >
        <GoogleG />
        <span>{t("continueWithGoogle")}</span>
      </button>

      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={click("github")}
          disabled={disabled}
          className="pixel-btn"
          style={{
            flex: 1,
            padding: "8px 8px",
            fontSize: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <GithubIcon /> {t("continueWithGithub")}
        </button>
        <button
          type="button"
          onClick={click("apple")}
          disabled={disabled}
          className="pixel-btn"
          style={{
            flex: 1,
            padding: "8px 8px",
            fontSize: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
           {t("continueWithApple")}
        </button>
      </div>
    </>
  );
}

function GoogleG() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" style={{ flexShrink: 0 }} aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8a12 12 0 1 1 7.9-21l5.7-5.7C34 6 29.3 4 24 4a20 20 0 1 0 0 40c11 0 19.6-8 19.6-20 0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 16 19 13 24 13c2.7 0 5.4.9 7.4 2.5l5.7-5.7C34 6 29.3 4 24 4 16.3 4 9.6 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.4-4.6 2.4-7.2 2.4-5.2 0-9.6-3.4-11.2-8L6.2 33C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.1 4.1-3.8 5.5l6.2 5.2C42 36 44 30 44 24c0-1.2-.1-2.4-.4-3.5z" />
    </svg>
  );
}

function GithubIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }} aria-hidden>
      <path d="M12 .3a12 12 0 0 0-3.8 23.4c.6 0 .8-.3.8-.6v-2.2c-3.3.7-4-1.6-4-1.6-.5-1.4-1.3-1.8-1.3-1.8-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-6 0-1.3.5-2.3 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.7 1.7.2 2.9.1 3.2.8.9 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.5.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3" />
    </svg>
  );
}
