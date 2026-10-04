"use client";

import { useTranslations } from "next-intl";

import { useChimeStore } from "@/lib/lbt/chimeStore";

/** 提示音 on/off. The name stays "提示音"; the pressed state says which. */
export function ChimeToggle({ className = "" }: { className?: string }) {
  const t = useTranslations("lbt.cues");
  const enabled = useChimeStore((s) => s.enabled);
  const setEnabled = useChimeStore((s) => s.setEnabled);
  return (
    <button
      type="button"
      className={`chime-toggle ${className}`.trim()}
      aria-pressed={enabled}
      onClick={() => setEnabled(!enabled)}
    >
      <span aria-hidden="true">{enabled ? "♪" : "·"}</span>
      {t("sound")}
      <span aria-hidden="true">：{enabled ? t("on") : t("off")}</span>
    </button>
  );
}
