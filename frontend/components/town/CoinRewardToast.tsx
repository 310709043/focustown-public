"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { formatMinor, useWalletStore } from "@/lib/state/walletStore";

/**
 * Floating toast that appears when T-coins are earned from a focus session.
 * Shows the total earned amount plus bonus breakdown (night owl, streak).
 * Auto-dismisses after 4 seconds.
 */
export function CoinRewardToast() {
  const lastDelta = useWalletStore((s) => s.lastDelta);
  const clearLastDelta = useWalletStore((s) => s.clearLastDelta);
  const t = useTranslations("town.coin");

  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const outerRef = useRef<ReturnType<typeof setTimeout>>();
  const innerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!lastDelta) return;
    if (lastDelta.currency !== "T") return;
    if (lastDelta.reason !== "session_complete") return;

    setVisible(true);
    setLeaving(false);

    outerRef.current = setTimeout(() => {
      setLeaving(true);
      innerRef.current = setTimeout(() => {
        setVisible(false);
        setLeaving(false);
        clearLastDelta();
      }, 400);
    }, 4000);

    return () => {
      if (outerRef.current) clearTimeout(outerRef.current);
      if (innerRef.current) clearTimeout(innerRef.current);
    };
  }, [lastDelta, clearLastDelta]);

  if (!visible || !lastDelta) return null;

  const total = formatMinor("T", lastDelta.amount);
  const meta = lastDelta.metadata;
  const hasNight = meta && meta.night > 0;
  const hasStreak = meta && meta.streak > 0;

  return (
    <>
      <style>{`
        @keyframes coinToastIn {
          from { opacity: 0; transform: translateY(24px) scale(0.95); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes coinToastOut {
          from { opacity: 1; transform: translateY(0) scale(1); }
          to   { opacity: 0; transform: translateY(-12px) scale(0.95); }
        }
        @keyframes coinGlow {
          0%, 100% { text-shadow: 0 0 8px rgba(252,211,77,0.6); }
          50%      { text-shadow: 0 0 18px rgba(252,211,77,0.9), 0 0 30px rgba(245,158,11,0.4); }
        }
        @media (prefers-reduced-motion: reduce) {
          .coin-toast-enter { animation: none !important; }
          .coin-toast-leave { animation: none !important; }
        }
      `}</style>
      <div
        className={leaving ? "coin-toast-leave" : "coin-toast-enter"}
        style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          zIndex: 9999,
          background: "rgba(26,15,46,0.92)",
          border: "1px solid rgba(252,211,77,0.5)",
          borderRadius: 8,
          padding: "14px 18px",
          minWidth: 180,
          boxShadow:
            "0 0 20px rgba(252,211,77,0.15), 0 4px 24px rgba(0,0,0,0.5)",
          animation: leaving
            ? "coinToastOut 0.4s ease-in forwards"
            : "coinToastIn 0.5s ease-out",
        }}
      >
        {/* Total earned */}
        <div
          style={{
            fontFamily: "var(--font-vt323), monospace",
            fontSize: 22,
            color: "var(--amber)",
            animation: "coinGlow 2s ease-in-out infinite",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span style={{ fontSize: 18 }}>+{total}</span>
          <span style={{ fontSize: 14, opacity: 0.8 }}>{t("unit")}</span>
        </div>

        {/* Breakdown */}
        <div
          className="font-silkscreen"
          style={{
            marginTop: 8,
            fontSize: 9,
            color: "var(--ink-mute)",
            display: "flex",
            flexDirection: "column",
            gap: 3,
            letterSpacing: "0.1em",
          }}
        >
          {meta && meta.base > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span>*</span>
              <span>
                {t("baseReward")} +{formatMinor("T", meta.base)}
              </span>
            </div>
          )}
          {hasNight && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                color: "rgba(147,130,255,0.9)",
              }}
            >
              <span style={{ fontSize: 11 }}>*</span>
              <span>
                {t("nightBonus")} +{formatMinor("T", meta!.night)}
              </span>
            </div>
          )}
          {hasStreak && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                color: "rgba(251,146,60,0.9)",
              }}
            >
              <span style={{ fontSize: 11 }}>*</span>
              <span>
                {t("streakBonus", { days: meta!.streak_days })} +
                {formatMinor("T", meta!.streak)}
              </span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
