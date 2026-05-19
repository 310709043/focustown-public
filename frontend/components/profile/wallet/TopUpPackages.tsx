"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { useToastStore } from "@/lib/state/toastStore";

interface Pkg {
  id: string;
  coins: number;
  bonus: number;
  priceTwd: number;
  ribbon?: "hot" | "value" | "best";
}

const PACKAGES: Pkg[] = [
  { id: "p100", coins: 100, bonus: 0, priceTwd: 30 },
  { id: "p500", coins: 500, bonus: 50, priceTwd: 140, ribbon: "hot" },
  { id: "p1200", coins: 1200, bonus: 200, priceTwd: 320, ribbon: "value" },
  { id: "p3000", coins: 3000, bonus: 600, priceTwd: 720, ribbon: "best" },
];

const PAYMENT_METHODS = ["VISA", "MC", "JCB", "APPLE PAY", "GOOGLE PAY", "LINE PAY"];

export function TopUpPackages() {
  const t = useTranslations("profile.wallet");
  const push = useToastStore((s) => s.push);
  const [selectedId, setSelectedId] = useState<string>("p500");
  const selected = PACKAGES.find((p) => p.id === selectedId) ?? PACKAGES[1];
  const comingSoon = () =>
    push({ kind: "info", message: t("comingSoon") });

  return (
    <section
      data-testid="wallet-topup"
      className="pixel-panel"
      style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          color: "var(--ink-mute)",
        }}
      >
        <span
          className="font-silkscreen"
          style={{
            fontSize: 11,
            letterSpacing: "0.3em",
            color: "var(--accent-2)",
          }}
        >
          ● {t("topUp.title")}
        </span>
        <span
          className="font-silkscreen"
          style={{ fontSize: 9, letterSpacing: "0.28em" }}
        >
          {t("topUp.paymentMethods")}
        </span>
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 10,
        }}
      >
        {PACKAGES.map((pkg) => {
          const active = pkg.id === selectedId;
          return (
            <button
              key={pkg.id}
              type="button"
              data-testid={`wallet-topup-${pkg.id}`}
              onClick={() => setSelectedId(pkg.id)}
              className="pixel-btn font-silkscreen"
              style={{
                position: "relative",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 8,
                padding: "16px 8px 12px",
                background: active
                  ? "rgba(245,158,11,0.12)"
                  : "rgba(20,10,55,0.55)",
                borderColor: active ? "#f59e0b" : "var(--panel-stroke-strong)",
                color: "var(--ink)",
                boxShadow: active
                  ? "0 0 16px rgba(245,158,11,0.35) inset"
                  : "none",
                cursor: "pointer",
              }}
            >
              {pkg.ribbon ? (
                <span
                  aria-hidden
                  style={{
                    position: "absolute",
                    top: -8,
                    right: 8,
                    background:
                      pkg.ribbon === "best"
                        ? "#fbbf24"
                        : pkg.ribbon === "value"
                          ? "#a78bfa"
                          : "#f472b6",
                    color: "#0c0524",
                    fontSize: 9,
                    letterSpacing: "0.2em",
                    padding: "2px 6px",
                  }}
                >
                  {pkg.ribbon === "best"
                    ? t("topUp.ribbonBest")
                    : pkg.ribbon === "value"
                      ? t("topUp.ribbonValue")
                      : t("topUp.ribbonHot")}
                </span>
              ) : null}
              <span aria-hidden style={{ fontSize: 22, color: "#fbbf24" }}>
                ✦
              </span>
              <span
                style={{
                  fontSize: 16,
                  letterSpacing: "0.06em",
                  color: "#fde68a",
                }}
              >
                {pkg.coins.toLocaleString()}
              </span>
              {pkg.bonus > 0 ? (
                <span
                  style={{
                    fontSize: 9,
                    letterSpacing: "0.18em",
                    color: "#6ee7b7",
                  }}
                >
                  {t("topUp.bonusBadge", { amount: pkg.bonus })}
                </span>
              ) : (
                <span style={{ height: 12 }} aria-hidden />
              )}
              <span
                style={{
                  fontSize: 11,
                  letterSpacing: "0.18em",
                  color: "var(--ink)",
                }}
              >
                NT$ {pkg.priceTwd}
              </span>
            </button>
          );
        })}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginTop: 2,
        }}
      >
        <span
          className="font-silkscreen"
          style={{
            fontSize: 10,
            letterSpacing: "0.22em",
            color: "var(--ink-mute)",
          }}
        >
          {t("topUp.selectionLine", {
            coins: selected.coins,
            bonus: selected.bonus,
            total: selected.priceTwd,
          })}
        </span>
        <button
          type="button"
          data-testid="wallet-topup-confirm"
          onClick={comingSoon}
          className="pixel-btn font-silkscreen"
          style={{
            padding: "10px 18px",
            fontSize: 11,
            letterSpacing: "0.3em",
            background: "var(--accent)",
            borderColor: "var(--accent)",
            color: "#0c0524",
            cursor: "pointer",
          }}
        >
          {t("topUp.confirmCta")}
        </button>
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          marginTop: 6,
        }}
      >
        {PAYMENT_METHODS.map((m) => (
          <button
            key={m}
            type="button"
            onClick={comingSoon}
            data-testid={`wallet-payment-${m.replace(/\s+/g, "").toLowerCase()}`}
            className="font-silkscreen"
            style={{
              padding: "4px 10px",
              fontSize: 9,
              letterSpacing: "0.24em",
              color: "var(--ink-mute)",
              background: "rgba(20,10,55,0.55)",
              border: "1px solid var(--panel-stroke)",
              cursor: "pointer",
            }}
          >
            {m}
          </button>
        ))}
      </div>
    </section>
  );
}
