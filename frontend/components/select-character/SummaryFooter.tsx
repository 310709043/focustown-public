"use client";

import { useTranslations } from "next-intl";

interface SummaryFooterProps {
  roleName: string;
  interestsCount: number;
  skillsCount: number;
  /** Confirm enabled only when this is true (nickname not blank). */
  canConfirm: boolean;
  /** True while the network call is in-flight. */
  saving: boolean;
  onConfirm: () => void;
}

/**
 * Bottom-bar summary across the right column. Shows the current role
 * pick + interest count + skill count (each in its own accent color)
 * and a confirm CTA that doubles as the "enter town" button.
 */
export function SummaryFooter({
  roleName,
  interestsCount,
  skillsCount,
  canConfirm,
  saving,
  onConfirm,
}: SummaryFooterProps) {
  const t = useTranslations("characters.selectPage");
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "10px 0",
        borderTop: "1px solid var(--panel-stroke)",
      }}
    >
      <div
        className="font-silkscreen"
        style={{
          display: "flex",
          gap: 14,
          fontSize: 10,
          color: "var(--ink-mute)",
          flexWrap: "wrap",
        }}
      >
        <span>
          {t("role")}: <span style={{ color: "var(--accent)" }}>{roleName}</span>
        </span>
        <span>
          · {t("interests")}: <span style={{ color: "var(--accent-2)" }}>{interestsCount}</span>
        </span>
        <span>
          · {t("skills")}: <span style={{ color: "var(--accent-3)" }}>{skillsCount}</span>
        </span>
      </div>
      <button
        type="button"
        data-testid="confirm-cta"
        className="pixel-btn primary"
        disabled={!canConfirm || saving}
        onClick={onConfirm}
        style={{
          padding: "12px 22px",
          fontSize: 12,
          opacity: canConfirm && !saving ? 1 : 0.5,
          cursor: canConfirm && !saving ? "pointer" : "not-allowed",
        }}
      >
        {saving ? t("savingCta") : t("enterTownBtn")}
      </button>
    </div>
  );
}
