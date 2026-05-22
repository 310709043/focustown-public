import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";

import { GlobalAudioMount } from "@/components/audio/GlobalAudioMount";
import { StationRealtimeBridge } from "@/components/audio/StationRealtimeBridge";
import { DirectionSync } from "@/components/chrome/DirectionSync";
import { SplashGate } from "@/components/chrome/SplashGate";
import { Toaster } from "@/components/chrome/Toaster";
import { LocaleSwitcher } from "@/components/i18n/LocaleSwitcher";
import { routing, type Locale } from "@/i18n/routing";

function isSupportedLocale(value: string): value is Locale {
  return (routing.locales as readonly string[]).includes(value);
}

const OG_LOCALE: Record<Locale, string> = {
  "zh-TW": "zh_TW",
  en: "en_US",
};

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const safe = isSupportedLocale(locale) ? locale : routing.defaultLocale;
  const { getTranslations } = await import("next-intl/server");
  const t = await getTranslations({ locale: safe, namespace: "auth.splash" });

  const languages = Object.fromEntries(
    routing.locales.map((l) => [l, `/${l}`]),
  ) as Record<Locale, string>;

  return {
    metadataBase: new URL(siteUrl),
    title: "Low Battery Town",
    description: t("tagline"),
    alternates: {
      canonical: `/${safe}`,
      languages: {
        ...languages,
        "x-default": `/${routing.defaultLocale}`,
      },
    },
    openGraph: {
      type: "website",
      url: `/${safe}`,
      title: "Low Battery Town",
      description: t("tagline"),
      locale: OG_LOCALE[safe],
      alternateLocale: routing.locales
        .filter((l) => l !== safe)
        .map((l) => OG_LOCALE[l]),
    },
    icons: {
      icon: [{ url: "/logo.png", type: "image/png" }],
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
      <Toaster />
      {/* Single global <audio> element + store subscriber. Mounted once
          here so playback survives page navigation; every UI player
          surface (MusicPlayer, FloatingMusicPlayer, PersonalRadio) is
          a pure controller that dispatches to useAudioStore. */}
      <GlobalAudioMount />
      <StationRealtimeBridge />
      {/* z-40 keeps the switcher above TownTopHUD (z-20) so it can
          never be visually eaten by the right cluster again. Visual
          styling now lives inside LocaleSwitcher itself (pixel-panel
          vocabulary) — no wrapper override needed. */}
      <div className="fixed top-3 right-3 z-40 pointer-events-auto">
        <LocaleSwitcher />
      </div>
      {children}
    </NextIntlClientProvider>
  );
}
