"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";

import { PixelWord } from "@/components/pixel/PixelWord";
import { StarField } from "@/components/pixel/StarField";
import { Logo } from "@/components/scene/Logo";
import { Link } from "@/i18n/routing";

interface SelectCharacterSceneProps {
  /** Page body (dual-column grid). */
  children: ReactNode;
  /** Step counter shown in the top bar (defaults to 02 / 03 per reference). */
  step?: number;
  totalSteps?: number;
  /** Where the ◀ back button navigates. Default `/signup` matches the
   *  primary signup flow; deep-link consumers (e.g. an "edit character"
   *  entry from `/town`) override this. OCP — additive optional prop. */
  backHref?: string;
}

/**
 * Outer wrapper for `/select-character`. Radial sky gradient
 * background + StarField + 50 px header (◀ back, step counter,
 * progress dots, logo, FOCUSTOWN wordmark). The locale switcher
 * lives in the global LocaleLayout top-right slot, so this header
 * deliberately leaves that area empty.
 */
export function SelectCharacterScene({
  children,
  step = 2,
  totalSteps = 3,
  backHref = "/signup",
}: SelectCharacterSceneProps) {
  const t = useTranslations("characters.selectPage");
  return (
    <main
      className="absolute inset-0 overflow-hidden"
      style={{
        background:
          "radial-gradient(ellipse at 50% 20%, var(--sky-mid) 0%, var(--sky-top) 60%, var(--bg-0) 100%)",
      }}
    >
      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        <StarField density={0.0008} />
      </div>

      {/* Top bar */}
      <div
        className="relative"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 24px",
          borderBottom: "1px solid var(--panel-stroke)",
          background: "rgba(7,4,26,0.7)",
          zIndex: 5,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link
            href={backHref as Parameters<typeof Link>[0]["href"]}
            className="pixel-btn"
            style={{
              padding: "6px 12px",
              fontSize: 10,
              textDecoration: "none",
            }}
          >
            ◀ {t("back")}
          </Link>
          <div
            className="font-silkscreen"
            style={{
              fontSize: 11,
              color: "var(--ink-mute)",
              letterSpacing: "0.2em",
            }}
          >
            {t("step")} {String(step).padStart(2, "0")} / {String(totalSteps).padStart(2, "0")}
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {Array.from({ length: totalSteps }).map((_, i) => (
              <ProgressDot
                key={i}
                done={i + 1 < step}
                active={i + 1 === step}
              />
            ))}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Logo scale={0.7} />
          <PixelWord
            text="FOCUSTOWN"
            scale={2}
            color="var(--accent)"
            glow="var(--accent)"
          />
        </div>
        {/* Locale switcher slot — rendered globally in LocaleLayout. */}
        <div style={{ width: 64 }} aria-hidden />
      </div>

      <div
        className="relative"
        style={{
          height: "calc(100% - 50px)",
          overflow: "hidden",
        }}
      >
        {children}
      </div>
    </main>
  );
}

function ProgressDot({ done, active }: { done?: boolean; active?: boolean }) {
  return (
    <span
      aria-hidden
      style={{
        width: 10,
        height: 10,
        background: done || active ? "var(--accent)" : "rgba(0,0,0,0.3)",
        border: "1px solid var(--accent)",
        boxShadow: active ? "var(--neon-glow)" : "none",
      }}
    />
  );
}
