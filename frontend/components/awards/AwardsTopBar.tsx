"use client";

import { useTranslations } from "next-intl";

import { BlinkDot } from "@/components/pixel/BlinkDot";
import { useRouter } from "@/i18n/routing";

/**
 * 46 px top bar for /awards. Mirrors the reference's modal-overlay chrome:
 * BlinkDot + uppercase silkscreen title with amber glow; right-aligned
 * pixel-btn close button routing back to /town.
 */
export function AwardsTopBar() {
  const router = useRouter();
  const t = useTranslations("town.awards");

  return (
    <header
      data-testid="awards-top-bar"
      style={{
        height: 46,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 18px",
        background: "rgba(3,1,17,0.96)",
        borderBottom: "1px solid var(--panel-stroke)",
        flexShrink: 0,
      }}
    >
      <div
        className="font-silkscreen"
        style={{
          fontSize: 10,
          letterSpacing: "0.2em",
          color: "var(--amber)",
          textShadow: "0 0 10px var(--amber)",
          display: "flex",
          alignItems: "center",
        }}
      >
        <BlinkDot color="var(--amber)" marginRight={6} />
        {t("title")}
      </div>
      <button
        type="button"
        className="pixel-btn"
        style={{ fontSize: 10, padding: "6px 12px" }}
        onClick={() => router.push("/town")}
      >
        {t("closeCta")}
      </button>
    </header>
  );
}
