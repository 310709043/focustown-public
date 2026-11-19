import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { GuideShell } from "@/components/lbt/GuideShell";
import { LooksOffer } from "@/components/lbt/LooksOffer";
import { PondOffer } from "@/components/lbt/PondOffer";
import { UnlockForm } from "@/components/lbt/UnlockForm";

type Params = Promise<{ locale: string }>;

/**
 * The koi pond offer, the other paid looks (while on sale) and the code form. Linked from the home stage only once
 * the pond is on sale (lib/lbt/pond); kept out of search either way.
 */
export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "lbt.unlock" });
  // Its own canonical and description, so the noindex page does not point at
  // the home page or repeat the home page's search snippet.
  return {
    title: t("title"),
    description: t("intro"),
    alternates: { canonical: `/${locale}/unlock` },
    robots: { index: false, follow: false },
  };
}

export default async function UnlockPage({ params }: { params: Params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <GuideShell>
      <article className="unlock">
        <PondOffer />
        <LooksOffer />
        <UnlockForm />
      </article>
    </GuideShell>
  );
}
