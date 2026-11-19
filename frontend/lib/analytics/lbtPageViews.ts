import { findArticle } from "@/lib/lbt/articles";

const configuredId = (process.env.NEXT_PUBLIC_LBT_GA_ID ?? "").trim();
export const LBT_GA_ID = /^G-[A-Z0-9]+$/.test(configuredId) ? configuredId : "";
export const GOOGLE_TAG_ORIGIN = "https://www.googletagmanager.com";

export function lbtAnalyticsPath(pathname: string): string | null {
  const path = pathname.replace(/\/$/, "");
  const match = /^\/(zh-TW|en)(\/guide(?:\/([a-z0-9-]+))?)?$/.exec(path);
  return match && (!match[3] || findArticle(match[3])) ? path : null;
}

export function analyticsReferrer(referrer: string): string {
  if (!referrer) return "";
  try {
    const url = new URL(referrer);
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : "";
  } catch {
    return "";
  }
}
