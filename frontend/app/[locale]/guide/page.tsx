import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Wordmark } from "@/components/lbt/BrandMark";
import { Link, routing } from "@/i18n/routing";
import { fillLegalFacts, POLICY_SLUGS } from "@/lib/lbt/legal";
import { BRAND } from "@/lib/lbt/site";
import { lbtFontVariables } from "@/lib/lbtFonts";
import "@/components/lbt/lbt.css";

type Params = Promise<{ locale: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "lbt.guide" });
  const title = t("title");
  const description = t("description");
  const path = `/${locale}/guide`;
  return {
    title,
    description,
    alternates: {
      canonical: path,
      languages: {
        ...Object.fromEntries(routing.locales.map((l) => [l, `/${l}/guide`])),
        "x-default": `/${routing.defaultLocale}/guide`,
      },
    },
    openGraph: {
      type: "website", siteName: BRAND, url: path, title, description,
      images: [{ url: "/brand/og-lbt.png", width: 1200, height: 630 }],
    },
    twitter: { card: "summary_large_image", title, description, images: ["/brand/og-lbt.png"] },
  };
}

/** Public, server-rendered guidance. No private conversations are exposed. */
export default async function GuidePage({ params }: { params: Params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "lbt" });
  const questions = t.raw("guide.questions") as { q: string; a: string }[];
  return (
    <div className={`lbt ${lbtFontVariables}`}>
      <div className="site-shell">
        <header className="topbar">
          <Link className="brand" href="/" aria-label={t("brand.homeAria")}><Wordmark /></Link>
          <nav className="policy-nav" aria-label={t("policy.nav.aria")}>
            {POLICY_SLUGS.map((slug) => (
              <Link key={slug} href={`/policies/${slug}`}>{t(`policy.nav.${slug}`)}</Link>
            ))}
          </nav>
        </header>
        <main className="policy">
          <h1>{t("guide.title")}</h1>
          <p className="policy-intro">{t("guide.intro")}</p>
          {questions.map(({ q, a }) => <section key={q}><h2>{q}</h2><p>{fillLegalFacts(a)}</p></section>)}
          <p className="policy-contact">
            <Link className="text-button" href="/">{t("policy.nav.home")} <span aria-hidden="true">↗</span></Link>
          </p>
        </main>
      </div>
    </div>
  );
}
