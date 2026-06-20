import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";

import { AchievementToastManager } from "@/components/achievements/AchievementToastManager";
import { AdSenseScript } from "@/components/ads/AdSenseScript";
import { GoogleAnalytics } from "@/components/analytics/GoogleAnalytics";
import { GlobalAudioMount } from "@/components/audio/GlobalAudioMount";
import { StationRealtimeBridge } from "@/components/audio/StationRealtimeBridge";
import { DirectionSync } from "@/components/chrome/DirectionSync";
import { SplashGate } from "@/components/chrome/SplashGate";
import { ConnectionBanner } from "@/components/chrome/ConnectionBanner";
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

  const title = {
    default: "Low Battery Town — Focus & Social Study Platform",
    template: "%s | Low Battery Town",
  };

  return {
    metadataBase: new URL(siteUrl),
    title,
    description: t("tagline"),
    keywords: [
      "focus", "pomodoro", "study", "lofi", "social study",
      "focus timer", "study together", "pixel art", "低電量小鎮",
      "專注", "讀書", "番茄鐘", "一起讀書",
    ],
    authors: [{ name: "Low Battery Town" }],
    creator: "Low Battery Town",
    alternates: {
      canonical: `/${safe}`,
      languages: {
        ...languages,
        "x-default": `/${routing.defaultLocale}`,
      },
    },
    openGraph: {
      type: "website",
      siteName: "Low Battery Town",
      url: `/${safe}`,
      title: "Low Battery Town — Focus & Social Study Platform",
      description: t("tagline"),
      locale: OG_LOCALE[safe],
      alternateLocale: routing.locales
        .filter((l) => l !== safe)
        .map((l) => OG_LOCALE[l]),
      images: [
        {
          url: "/og-image.png",
          width: 1200,
          height: 630,
          alt: "Low Battery Town — A cinematic focus & social study platform",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "Low Battery Town — Focus & Social Study Platform",
      description: t("tagline"),
      images: ["/og-image.png"],
    },
    icons: {
      icon: [{ url: "/logo.png", type: "image/png" }],
      apple: "/logo.png",
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-video-preview": -1,
        "max-image-preview": "large",
        "max-snippet": -1,
      },
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
      {/* JSON-LD structured data for SEO rich results */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: "Low Battery Town",
            alternateName: "低電量小鎮",
            url: siteUrl,
            description:
              "A cinematic pixel-art focus & social study platform with pomodoro timer, live leaderboards, and partner matching.",
            inLanguage: ["zh-TW", "en"],
            potentialAction: {
              "@type": "SearchAction",
              target: `${siteUrl}/{locale}/town`,
              "query-input": "required name=search",
            },
          }),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Organization",
            name: "Low Battery Town",
            alternateName: "低電量小鎮",
            url: siteUrl,
            logo: `${siteUrl}/logo.png`,
            sameAs: [],
            description:
              "A cinematic pixel-art focus & social study platform.",
          }),
        }}
      />
      <div className="grain-overlay" aria-hidden />
      <div className="vignette-overlay" aria-hidden />
      <div className="crt-overlay" aria-hidden />
      <DirectionSync locale={locale} />
      <SplashGate />
      <Toaster />
      <ConnectionBanner />
      <AchievementToastManager />
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
      <AdSenseScript />
      <GoogleAnalytics />
      {children}
    </NextIntlClientProvider>
  );
}
