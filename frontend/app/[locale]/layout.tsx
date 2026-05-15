import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";

import { DirectionSync } from "@/components/chrome/DirectionSync";
import { SplashGate } from "@/components/chrome/SplashGate";
import { routing, type Locale } from "@/i18n/routing";

function isSupportedLocale(value: string): value is Locale {
  return (routing.locales as readonly string[]).includes(value);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const safe = isSupportedLocale(locale) ? locale : routing.defaultLocale;
  const { getTranslations } = await import("next-intl/server");
  const t = await getTranslations({ locale: safe, namespace: "auth.splash" });
  return {
    title: "Focus Town",
    description: t("tagline"),
    icons: {
      icon: [
        { url: "/logo.svg", type: "image/svg+xml" },
        { url: "/logo.png", type: "image/png" },
      ],
      apple: "/logo.png",
    },
  };
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) {
    notFound();
  }
  setRequestLocale(locale);

  const messages = await getMessages();

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <div className="grain-overlay" aria-hidden />
      <div className="vignette-overlay" aria-hidden />
      <div className="crt-overlay" aria-hidden />
      <DirectionSync locale={locale} />
      <SplashGate />
      {children}
    </NextIntlClientProvider>
  );
}
