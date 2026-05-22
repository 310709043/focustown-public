"use client";

import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";

import { routing, usePathname, useRouter, type Locale } from "@/i18n/routing";

const LABELS: Record<Locale, string> = {
  "zh-TW": "繁中",
  en: "EN",
};

/**
 * Pixel-arcade segmented toggle for locale.
 *
 * Two short labels, both always visible — no dropdown, no chevron, no
 * surprise. The active segment lights up in warm peach (`--a1`) so it
 * reads as part of the TownTopHUD vocabulary; the inactive segment
 * stays dim and brightens on hover. Sits on top of every page (z-40)
 * via the global locale layout slot, so it can never be visually
 * eaten by an underlying chrome panel again.
 */
export function LocaleSwitcher({ className }: { className?: string }) {
  const current = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const t = useTranslations("common.locale");

  function pick(next: Locale) {
    if (next === current) return;
    startTransition(() => {
      router.replace(pathname, { locale: next });
    });
  }

  return (
    <div
      className={`locale-switcher ${className ?? ""}`.trim()}
      role="group"
      aria-label={t("aria")}
      data-pending={pending || undefined}
      data-testid="locale-switcher"
    >
      {routing.locales.map((l) => {
        const active = l === current;
        return (
          <button
            key={l}
            type="button"
            onClick={() => pick(l)}
            aria-pressed={active}
            data-active={active || undefined}
            className="locale-switcher__btn font-silkscreen"
          >
            <span className="locale-switcher__pip" aria-hidden>
              {active ? "▮" : " "}
            </span>
            {LABELS[l]}
          </button>
        );
      })}
    </div>
  );
}
