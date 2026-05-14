"use client";

import { useLocale } from "next-intl";
import { useTransition } from "react";

import { routing, usePathname, useRouter, type Locale } from "@/i18n/routing";

const LABELS: Record<Locale, string> = {
  "zh-TW": "繁中",
  en: "EN",
};

export function LocaleSwitcher({ className }: { className?: string }) {
  const current = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  function pick(next: Locale) {
    if (next === current) return;
    startTransition(() => {
      router.replace(pathname, { locale: next });
    });
  }

  return (
    <div
      className={className}
      role="group"
      aria-label="Language"
      data-pending={pending || undefined}
    >
      {routing.locales.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => pick(l)}
          aria-pressed={l === current}
          className={
            l === current
              ? "px-2 py-1 text-xs font-mono opacity-100"
              : "px-2 py-1 text-xs font-mono opacity-50 hover:opacity-80"
          }
        >
          {LABELS[l]}
        </button>
      ))}
    </div>
  );
}
