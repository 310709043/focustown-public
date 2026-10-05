import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { ArticleLinks, GuideShell } from "@/components/lbt/GuideShell";
import { Link, routing } from "@/i18n/routing";
import { ARTICLE_SLUGS } from "@/lib/lbt/articles";
import { fillLegalFacts } from "@/lib/lbt/legal";
import { BRAND, jsonLd, SITE_URL } from "@/lib/lbt/site";

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
  const questions = (t.raw("guide.questions") as { q: string; a: string }[]).map(({ q, a }) => ({
    q,
    a: fillLegalFacts(a),
  }));
  return (
    <GuideShell>
      {/* FAQPage mirrors the visible answers word for word. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "FAQPage",
                inLanguage: locale,
                mainEntity: questions.map(({ q, a }) => ({
                  "@type": "Question",
                  name: q,
                  acceptedAnswer: { "@type": "Answer", text: a },
                })),
              },
              {
                "@type": "BreadcrumbList",
                itemListElement: [
                  { "@type": "ListItem", position: 1, name: BRAND, item: `${SITE_URL}/${locale}` },
                  { "@type": "ListItem", position: 2, name: t("guide.title"), item: `${SITE_URL}/${locale}/guide` },
                ],
              },
            ],
          }),
        }}
      />
      <h1>{t("guide.title")}</h1>
      <p className="policy-intro">{t("guide.intro")}</p>
      {questions.map(({ q, a }) => <section key={q}><h2>{q}</h2><p>{a}</p></section>)}
      <ArticleLinks
        title={t("articles.listTitle")}
        items={ARTICLE_SLUGS.map((slug) => ({ slug, label: t(`articles.items.${slug}.nav`) }))}
      />
      <p className="policy-contact">
        <Link className="text-button" href="/">{t("policy.nav.home")} <span aria-hidden="true">↗</span></Link>
      </p>
    </GuideShell>
  );
}
