"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { Link, useRouter } from "@/i18n/routing";
import { useAuthStore } from "@/lib/state/authStore";
import { markAudioUnlocked } from "@/lib/audio/unlock";
import { Logo } from "@/components/scene/Logo";
import { Airplane } from "@/components/scene/Airplane";
import { PixelSprite } from "@/components/pixel/PixelSprite";
import { AVATARS } from "@/lib/pixel/sprites/avatars";

/* Pre-computed sprinkle of pixel stars; deterministic so SSR + client match. */
function generateStars(count: number, seed = 7) {
  const out: { top: number; left: number; size: number; dur: number; delay: number }[] = [];
  let h = seed * 2654435761;
  for (let i = 0; i < count; i++) {
    h = (h * 16807) % 2147483647;
    const r = (h / 2147483647 + 1) / 2;
    h = (h * 16807) % 2147483647;
    const r2 = (h / 2147483647 + 1) / 2;
    out.push({
      top: r * 60,
      left: r2 * 100,
      size: r > 0.85 ? 2 : 1,
      dur: 1.5 + r * 3.5,
      delay: r2 * 5,
    });
  }
  return out;
}

export default function SplashPage() {
  const router = useRouter();
  const { signIn, loading, error } = useAuthStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const stars = useMemo(() => generateStars(120), []);
  const [phase, setPhase] = useState<"night" | "dawn">("night");
  const t = useTranslations("auth.splash");

  // Cycle splash between night/dawn every 16s for visible weather change.
  useEffect(() => {
    const id = setInterval(
      () => setPhase((p) => (p === "night" ? "dawn" : "night")),
      16_000,
    );
    return () => clearInterval(id);
  }, []);

  const onSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    // Record the user gesture so `PersonalRadio` can auto-play once we
    // land on /town — the click on this button satisfies the browser
    // autoplay policy.
    markAudioUnlocked();
    try {
      await signIn(email, password);
      router.push("/town");
    } catch {
      /* error in store */
    }
  };

  return (
    <main
      className="absolute inset-0 overflow-hidden"
      style={{
        background:
          phase === "night"
            ? "radial-gradient(ellipse at 50% 35%, #1a0a6e 0%, #09023a 45%, #030111 100%)"
            : "linear-gradient(180deg, #0d0428 0%, #4c1d95 25%, #9d174d 55%, #ea580c 80%, #fcd34d 100%)",
        transition: "background 5s ease",
      }}
    >
      {/* twinkling stars (fade out at dawn) */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ opacity: phase === "night" ? 1 : 0.15, transition: "opacity 4s" }}
      >
        {stars.map((s, i) => (
          <span
            key={i}
            className="absolute rounded-full bg-white animate-twinkle"
            style={
              {
                width: s.size,
                height: s.size,
                top: `${s.top}%`,
                left: `${s.left}%`,
                ["--d" as string]: `${s.dur}s`,
                ["--dl" as string]: `-${s.delay}s`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>

      {/* drifting cloud (always visible, brighter at dawn) */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: "12%",
          left: 0,
          right: 0,
          height: 60,
          opacity: phase === "night" ? 0.25 : 0.6,
          transition: "opacity 4s",
        }}
      >
        <div
          className="absolute"
          style={{
            top: 0,
            left: "20%",
            width: 140,
            height: 28,
            background:
              "linear-gradient(90deg, rgba(255,255,255,0.5), rgba(252,211,77,0.3))",
            borderRadius: 50,
            filter: "blur(6px)",
            animation: "carDrive 60s linear infinite",
          }}
        />
        <div
          className="absolute"
          style={{
            top: 12,
            left: "55%",
            width: 100,
            height: 20,
            background:
              "linear-gradient(90deg, rgba(196,181,253,0.5), rgba(167,139,250,0.3))",
            borderRadius: 50,
            filter: "blur(5px)",
            animation: "carDrive 80s linear infinite",
          }}
        />
      </div>

      {/* moon during night, sun during dawn */}
      <div
        className="absolute top-[10%] right-[12%] z-[2]"
        style={{ opacity: phase === "night" ? 1 : 0, transition: "opacity 3s" }}
      >
        <div
          className="w-20 h-20 rounded-full animate-moonPulse"
          style={{
            background: "radial-gradient(circle at 33% 28%, #fff9c4, #fef3c7, #fcd34d)",
          }}
        />
      </div>
      <div
        className="absolute top-[16%] right-[18%] z-[2]"
        style={{ opacity: phase === "night" ? 0 : 1, transition: "opacity 3s" }}
      >
        <div
          className="w-24 h-24 rounded-full"
          style={{
            background: "radial-gradient(circle at 40% 38%, #fff7ed, #fed7aa, #fb923c)",
            boxShadow: "0 0 60px rgba(251,146,60,0.7), 0 0 120px rgba(251,146,60,0.3)",
          }}
        />
      </div>

      {/* airplanes */}
      <Airplane intervalSeconds={22} />
      <Airplane intervalSeconds={31} delaySeconds={-12} topPercent={26} />

      {/* foreground content */}
      <div className="relative z-[5] h-full flex flex-col items-center justify-center px-6 gap-7 animate-fadeUp">
        <div className="flex flex-col items-center gap-3">
          <Logo scale={4} />
          <div
            className="font-japan"
            style={{
              fontSize: 16,
              color: "var(--muted)",
              letterSpacing: 6,
            }}
          >
            {t("tagline")}
          </div>
        </div>

        <form
          data-testid="signin-form"
          onSubmit={onSignIn}
          aria-busy={loading || undefined}
          className="pixel-panel p-6 w-full max-w-sm flex flex-col gap-3"
          style={{ opacity: loading ? 0.85 : 1, transition: "opacity 0.2s" }}
        >
          <input
            data-testid="signin-email"
            type="email"
            required
            placeholder={t("emailPlaceholder")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            readOnly={loading}
            className="pixel-input disabled:opacity-60 read-only:opacity-60"
          />
          <input
            data-testid="signin-password"
            type="password"
            required
            minLength={8}
            placeholder={t("passwordPlaceholder")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            readOnly={loading}
            className="pixel-input disabled:opacity-60 read-only:opacity-60"
          />
          {error ? (
            <div
              data-testid="signin-error"
              role="alert"
              className="font-japan"
              style={{
                fontSize: 14,
                color: "#fecaca",
                background: "rgba(220,38,38,0.18)",
                border: "1px solid rgba(248,113,113,0.6)",
                borderRadius: 6,
                padding: "10px 12px",
                lineHeight: 1.4,
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
            className="pixel-btn touch:min-h-[48px] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            style={{ fontSize: 12, padding: "12px 16px", letterSpacing: 3 }}
          >
            {loading ? (
              <span
                aria-hidden
                className="inline-block animate-spin"
                style={{ fontSize: 14, lineHeight: 1 }}
              >
                ⟳
              </span>
            ) : null}
            {loading ? t("loadingCta") : t("submitCta")}
          </button>
          <div className="flex items-center gap-2 my-1">
            <div className="flex-1 h-px bg-border" />
            <span style={{ fontSize: 11, color: "var(--muted)" }}>{t("or")}</span>
            <div className="flex-1 h-px bg-border" />
          </div>
          <Link
            data-testid="signup-link"
            href="/signup"
            aria-disabled={loading || undefined}
            tabIndex={loading ? -1 : undefined}
            onClick={loading ? (e) => e.preventDefault() : undefined}
            className="text-center font-japan border border-border rounded-md py-2.5 touch:py-3.5 hover:border-accent-1 hover:text-accent-1 active:border-accent-1 active:text-accent-1 text-muted transition-colors"
            style={{
              fontSize: 13,
              opacity: loading ? 0.4 : 1,
              pointerEvents: loading ? "none" : "auto",
            }}
          >
            {t("signupLink")}
          </Link>
        </form>

        {/* Pixel avatar strip — previews what character-select will offer.
            Uses the same staggered `gifBounce` cadence as the old emoji row,
            so the visual rhythm is preserved while swapping emoji glyphs
            for canvas-rendered AVATARS[0..4] (designer / frontend / novelist
            / researcher / musician). */}
        <div className="flex gap-3 items-end">
          {AVATARS.slice(0, 5).map((a, i) => (
            <span
              key={a.id}
              className="animate-gifBounce"
              style={
                {
                  ["--gif-dur" as string]: `${1.9 + i * 0.15}s`,
                  ["--gif-delay" as string]: `${i * 0.15}s`,
                } as React.CSSProperties
              }
            >
              <PixelSprite
                sprite={a.sprite}
                palette={a.palette}
                scale={2}
                title={a.name}
              />
            </span>
          ))}
        </div>
      </div>
    </main>
  );
}
