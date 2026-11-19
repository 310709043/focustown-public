import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { GuideShell } from "@/components/lbt/GuideShell";
import { routing } from "@/i18n/routing";
import { LBT_LEGAL } from "@/lib/lbt/legal";
import { BRAND } from "@/lib/lbt/site";

type PageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "lbt.collaboration" });
  const path = `/${locale}/collaborate`;
  const title = t("title");
  const description = t("description");
  return {
    title,
    description,
    alternates: {
      canonical: path,
      languages: {
        ...Object.fromEntries(routing.locales.map((language) => [language, `/${language}/collaborate`])),
        "x-default": `/${routing.defaultLocale}/collaborate`,
      },
    },
    openGraph: {
      type: "website", siteName: BRAND, url: path, title, description,
      images: [{ url: "/brand/og-lbt.png", width: 1200, height: 630 }],
    },
    twitter: { card: "summary_large_image", title, description, images: ["/brand/og-lbt.png"] },
  };
}

export default async function CollaboratePage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "lbt.collaboration" });
  const email = LBT_LEGAL.contactEmail;
  const contactLink = `mailto:${email}?subject=${encodeURIComponent(t("subject"))}`;

  return (
    <GuideShell showAnalytics={false}>
      <h1>{t("title")}</h1>
      <p className="policy-intro">{t("intro")}</p>
      <section>
        <h2>{t("termsTitle")}</h2>
        <p>{t("terms")}</p>
        <p className="mt-3">{t("agreement")}</p>
      </section>
      <section>
        <h2>{t("contactTitle")}</h2>
        <p>{t("contact")}</p>
        <p className="policy-contact">
          <a className="primary-button guide-entry-link" href={contactLink}>
            {email} <span aria-hidden="true">↗</span>
          </a>
        </p>
      </section>
    </GuideShell>
  );
}
