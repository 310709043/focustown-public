"use client";

import { useTranslations } from "next-intl";

import { BlinkDot } from "@/components/pixel/BlinkDot";
import { CornerDeco } from "@/components/login/CornerDeco";

/**
 * FOCUS+ subscription tier card. Disabled until Phase 10 wires the Visa
 * adapter; chrome stays so users can see what's coming.
 */
export function SubscriptionPanel() {
  const tPage = useTranslations("shop.page");
  const features: string[] = tPage.raw("subscriptionFeatures") as string[];

  return (
    <section
      data-testid="shop-subscription"
      className="pixel-panel"
      style={{
        position: "relative",
        padding: "15px 17px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <CornerDeco color="var(--accent-2)" />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <h3
          className="font-silkscreen"
          style={{
            fontSize: 10,
            letterSpacing: "0.1em",
            color: "var(--accent-2)",
            textShadow: "0 0 8px var(--accent-2)",
            margin: 0,
            display: "flex",
            alignItems: "center",
          }}
        >
          <BlinkDot color="var(--accent-2)" marginRight={6} />
          {tPage("subscriptionTitle")}
        </h3>
        <span
          className="font-silkscreen"
          style={{
            fontSize: 9,
            letterSpacing: "0.12em",
            color: "var(--accent-2)",
            border: "1px solid var(--accent-2)",
            padding: "2px 8px",
            borderRadius: 2,
            textShadow: "0 0 6px var(--accent-2)",
          }}
        >
          {tPage("subscriptionBadge")}
        </span>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 4,
          color: "var(--amber)",
          textShadow: "0 0 6px rgba(252,211,77,0.45)",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-vt323), monospace",
            fontSize: 22,
            letterSpacing: 0.6,
          }}
        >
          {tPage("subscriptionPrice")}
        </span>
        <span
          className="font-silkscreen"
          style={{ fontSize: 9, color: "var(--ink-mute)" }}
        >
          {tPage("subscriptionPriceSuffix")}
        </span>
      </div>

      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "flex",
          flexDirection: "column",
          gap: 5,
          fontSize: 12,
          color: "var(--ink-mute)",
          lineHeight: 1.45,
        }}
      >
        {features.map((line) => (
          <li
            key={line}
            style={{ display: "flex", alignItems: "flex-start", gap: 8 }}
          >
            <span
              aria-hidden
              style={{
                color: "var(--teal)",
                flexShrink: 0,
                textShadow: "0 0 6px var(--teal)",
              }}
            >
              ✓
            </span>
            <span>{line}</span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        disabled
        className="pixel-btn primary"
        style={{ fontSize: 10, padding: "8px 14px", marginTop: 4 }}
        title={tPage("subscriptionCtaTooltip")}
      >
        {tPage("subscriptionCta")}
      </button>
    </section>
  );
}
