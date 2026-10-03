"use client";

import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";

import { routing, usePathname, useRouter, type Locale } from "@/i18n/routing";

const LABELS: Record<Locale, string> = {
  "zh-TW": "繁中",
  en: "EN",
};

export function LocaleToggle() {
  const current = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();
  const t = useTranslations("lbt.topbar");

  function pick(next: Locale) {
    if (next === current) return;
    startTransition(() => {
      router.replace(pathname, { locale: next });
    });
  }

  return (
    <div className="locale-toggle" role="group" aria-label={t("languageAria")}>
      {routing.locales.map((locale) => (
        <button
          key={locale}
          type="button"
          lang={locale}
          aria-pressed={locale === current}
          onClick={() => pick(locale)}
        >
          {LABELS[locale]}
        </button>
      ))}
    </div>
  );
}
