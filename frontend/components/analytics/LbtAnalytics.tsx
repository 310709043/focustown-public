"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useSyncExternalStore } from "react";

import { analyticsReferrer, GOOGLE_TAG_ORIGIN, LBT_GA_ID, lbtAnalyticsPath } from "@/lib/analytics/lbtPageViews";

const CONSENT_KEY = "lbt.analytics.consent";
const LAYER_NAME = "lbtAnalyticsDataLayer";
const COOKIE_DAYS = 90;
const INITIAL_CONSENT = {
  analytics_storage: "denied",
  ad_storage: "denied",
  ad_user_data: "denied",
  ad_personalization: "denied",
} as const;

type AnalyticsWindow = Window & {
  [LAYER_NAME]?: IArguments[];
  [key: `ga-disable-${string}`]: boolean | undefined;
};

function analyticsWindow() {
  return window as unknown as AnalyticsWindow;
}

function getConsent() {
  try {
    return window.localStorage.getItem(CONSENT_KEY) === "granted";
  } catch {
    return false;
  }
}

function subscribeConsent(update: () => void) {
  window.addEventListener(CONSENT_KEY, update);
  window.addEventListener("storage", update);
  return () => {
    window.removeEventListener(CONSENT_KEY, update);
    window.removeEventListener("storage", update);
  };
}

function saveConsent(granted: boolean) {
  try {
    window.localStorage.setItem(CONSENT_KEY, granted ? "granted" : "denied");
  } catch {
    return;
  }
  if (!granted) analyticsWindow()[`ga-disable-${LBT_GA_ID}`] = true;
  window.dispatchEvent(new Event(CONSENT_KEY));
}

function sendView(path: string) {
  const browser = analyticsWindow();
  const firstView = !browser[LAYER_NAME];
  const dataLayer = (browser[LAYER_NAME] ??= []);
  const queue: (...args: unknown[]) => void = function () {
    dataLayer.push(arguments);
  };
  const page = {
    page_location: `${window.location.origin}${path}`,
    page_referrer: analyticsReferrer(document.referrer),
    page_title: "LowBatteryTown",
  };
  // Set the page context before the tag boots so its automatic events also
  // use the sanitized URL and referrer.
  queue("set", page);

  if (firstView) {
    queue("set", {
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      cookie_domain: "none",
      cookie_flags: "SameSite=Lax;Secure",
      cookie_expires: COOKIE_DAYS * 24 * 60 * 60,
      cookie_update: false,
    });
    queue("consent", "default", INITIAL_CONSENT);
    queue("consent", "update", { analytics_storage: "granted" });
    queue("js", new Date());
    queue("config", LBT_GA_ID, { send_page_view: false });
    const script = document.createElement("script");
    script.async = true;
    script.src = `${GOOGLE_TAG_ORIGIN}/gtag/js?id=${LBT_GA_ID}&l=${LAYER_NAME}`;
    script.referrerPolicy = "no-referrer";
    document.head.append(script);
  }
  queue("event", "page_view", { ...page, send_to: LBT_GA_ID });
}

function AnalyticsPreferences({ active, track }: { active: boolean; track: boolean }) {
  const t = useTranslations("lbt.analytics");
  const pathname = usePathname();
  const consent = useSyncExternalStore(subscribeConsent, getConsent, () => false);
  const lastPage = useRef<string | null>(null);

  useEffect(() => {
    if (!track) return;
    const path = lbtAnalyticsPath(pathname);
    const disableKey = `ga-disable-${LBT_GA_ID}` as const;
    const browser = analyticsWindow();
    browser[disableKey] = !consent || !active || !path;
    if (!consent) lastPage.current = null;
    if (consent && active && path && path !== lastPage.current) {
      sendView(path);
      lastPage.current = path;
    }
    return () => { browser[disableKey] = true; };
  }, [active, consent, pathname, track]);

  if (!active) return null;
  return (
    <label className="analytics-preferences">
      <input
        type="checkbox"
        checked={consent}
        onChange={(event) => saveConsent(event.currentTarget.checked)}
      />
      {t("allow")}
    </label>
  );
}

export function LbtAnalytics({ active = true, track = true }: { active?: boolean; track?: boolean }) {
  return LBT_GA_ID ? <AnalyticsPreferences active={active} track={track} /> : null;
}
