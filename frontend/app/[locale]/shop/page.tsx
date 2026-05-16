"use client";

import { useTranslations } from "next-intl";

export default function ShopPage() {
  const t = useTranslations("shop.comingSoon");
  return (
    <main
      data-testid="shop-coming-soon"
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #04011a, #090230, #04011a)",
      }}
    >
      <div
        className="pixel-panel"
        style={{ padding: 32, textAlign: "center", maxWidth: 420 }}
      >
        <div
          className="font-silkscreen"
          style={{
            fontSize: 18,
            color: "var(--accent)",
            letterSpacing: "0.2em",
            marginBottom: 12,
          }}
        >
          🛒 {t("title")}
        </div>
        <div
          className="font-silkscreen"
          style={{
            fontSize: 11,
            color: "var(--ink-mute)",
            lineHeight: 1.6,
          }}
        >
          {t("body")}
        </div>
      </div>
    </main>
  );
}
