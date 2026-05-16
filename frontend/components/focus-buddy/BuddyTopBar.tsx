"use client";

import { useTranslations } from "next-intl";

import { Logo } from "@/components/scene/Logo";
import { PixelWord } from "@/components/pixel/PixelWord";
import { CoinBadge } from "@/components/town/CoinBadge";
import { useRouter } from "@/i18n/routing";

/**
 * Top bar — back to town + Logo + FOCUSTOWN wordmark + accent-2 pink
 * BUDDY ROOM subtitle + center "SAME FOCUS · ROOM #N · N min" status
 * line + T-coin badge. Reference: screen-buddy.jsx:L45-L67.
 */
export function BuddyTopBar({ roomCode = "2847-A" }: { roomCode?: string }) {
  const t = useTranslations("focus.buddy.topBar");
  const router = useRouter();
  return (
    <header
      data-testid="buddy-top-bar"
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 18px",
        borderBottom: "1px solid var(--panel-stroke)",
        background: "rgba(7,4,26,0.75)",
        zIndex: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          type="button"
          data-testid="buddy-leave"
          aria-label={t("leaveAria")}
          className="pixel-btn"
          style={{ padding: "6px 12px", fontSize: 10 }}
          onClick={() => router.push("/town")}
        >
          ◀ {t("leaveCta")}
        </button>
        <Logo scale={0.7} />
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
          <PixelWord
            text="FOCUSTOWN"
            scale={1.6}
            color="var(--accent)"
            glow="var(--accent)"
          />
          <span
            className="font-silkscreen"
            style={{
              fontSize: 9,
              color: "var(--accent-2)",
              letterSpacing: "0.2em",
            }}
          >
            · {t("subtitle")}
          </span>
        </div>
      </div>

      <div
        className="font-silkscreen"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          fontSize: 11,
          color: "var(--accent)",
        }}
      >
        <span
          aria-hidden
          className="animate-blinkSoft"
          style={{
            display: "inline-block",
            width: 8,
            height: 8,
            background: "var(--accent-2)",
            boxShadow: "var(--neon-glow-pink)",
          }}
        />
        <span style={{ letterSpacing: "0.25em" }}>{t("sameFocusLabel")}</span>
        <span style={{ color: "var(--ink-dim)" }}>·</span>
        <span
          style={{ color: "var(--ink-mute)", letterSpacing: "0.15em" }}
        >
          {t("roomLine", { code: roomCode, minutes: 22 })}
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <CoinBadge />
      </div>
    </header>
  );
}
