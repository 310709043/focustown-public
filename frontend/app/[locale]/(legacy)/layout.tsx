import type { Metadata } from "next";
import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";

import { AchievementToastManager } from "@/components/achievements/AchievementToastManager";
import { AdSenseScript } from "@/components/ads/AdSenseScript";
import { GlobalAudioMount } from "@/components/audio/GlobalAudioMount";
import { StationRealtimeBridge } from "@/components/audio/StationRealtimeBridge";
import { ConnectionBanner } from "@/components/chrome/ConnectionBanner";
import { SplashGate } from "@/components/chrome/SplashGate";
import { Toaster } from "@/components/chrome/Toaster";
import { LocaleSwitcher } from "@/components/i18n/LocaleSwitcher";
import { fontVariables } from "@/lib/fonts";

/**
 * Shell for the original Focus Town routes (sign-in, town, focus rooms,
 * shop, awards, legal). LowBatteryTown owns `/`; these pages stay
 * reachable at their old URLs but are kept out of search results until
 * we decide whether to retire them.
 *
 * Everything that only makes sense for the pixel-city app (CRT overlays,
 * boot splash, global <audio>, realtime bridge, toasts, ad slot) lives
 * here so the LowBatteryTown surface stays free of it.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function LegacyLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  // The root layout sends only the LowBatteryTown messages to the browser;
  // the pixel-city pages read every legacy namespace, so they get the full set.
  // The locale comes from the URL: layouts render in parallel, so the root
  // layout's setRequestLocale is not visible here and getLocale() would fall
  // back to the default language.
  const { locale } = await params;
  setRequestLocale(locale);
  const messages = await getMessages({ locale });
  // The pixel-city fonts (and Noto Sans TC, about 1 MB of CJK slices) are
  // declared here, not in the root layout, so LowBatteryTown pages never
  // download them. `display: contents` keeps the wrapper out of layout.
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <div className={`legacy-fonts ${fontVariables}`}>
        <div className="grain-overlay" aria-hidden />
        <div className="vignette-overlay" aria-hidden />
        <div className="crt-overlay" aria-hidden />
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
            never be visually eaten by the right cluster again. */}
        <div className="fixed top-3 right-3 z-40 pointer-events-auto">
          <LocaleSwitcher />
        </div>
        <AdSenseScript />
        {children}
      </div>
    </NextIntlClientProvider>
  );
}
