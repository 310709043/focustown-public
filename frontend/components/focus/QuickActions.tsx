"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { useRouter } from "@/i18n/routing";

/**
 * Three small buttons in a single horizontal row (reference renders
 * them WITHOUT a surrounding `pixel-panel`). DND toggle, lock-phone
 * hint, and back to /town. DND and lock-phone are client-only nudges.
 */
export function QuickActions() {
  const t = useTranslations("focus.solo.quickActions");
  const router = useRouter();
  const [dnd, setDnd] = useState(false);

  return (
    <div
      data-testid="quick-actions"
      style={{ display: "flex", gap: 4 }}
    >
      <button
        type="button"
        data-testid="quick-action-dnd"
        className="pixel-btn"
        style={{
          flex: 1,
          padding: "6px 4px",
          fontSize: 10,
          color: dnd ? "var(--accent-2)" : undefined,
          borderColor: dnd ? "var(--accent-2)" : undefined,
        }}
        onClick={() => setDnd((prev) => !prev)}
      >
        🔕 {dnd ? t("dndOn") : t("dndOff")}
      </button>
      <button
        type="button"
        data-testid="quick-action-lock"
        className="pixel-btn"
        style={{ flex: 1, padding: "6px 4px", fontSize: 10 }}
        onClick={() => {
          /* future: integrate with browser screen-wake lock + reminder */
        }}
      >
        📱 {t("lockPhone")}
      </button>
      <button
        type="button"
        data-testid="quick-action-back"
        className="pixel-btn"
        style={{
          flex: 1,
          padding: "6px 4px",
          fontSize: 10,
          borderColor: "var(--accent-2)",
          color: "var(--accent-2)",
        }}
        onClick={() => router.push("/town")}
      >
        ← {t("backToTown")}
      </button>
    </div>
  );
}
