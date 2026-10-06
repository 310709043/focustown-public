import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { ArticleLinks, GuideShell } from "@/components/lbt/GuideShell";
import { Link, routing } from "@/i18n/routing";
import { ARTICLES, type ArticleCopy, findArticle } from "@/lib/lbt/articles";
import { fillLegalFacts } from "@/lib/lbt/legal";
import { BRAND, jsonLd, SITE_URL } from "@/lib/lbt/site";

type Params = Promise<{ locale: string; slug: string }>;

export function generateStaticParams() {
  return routing.locales.flatMap((locale) => ARTICLES.map(({ slug }) => ({ locale, slug })));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, slug } = await params;
  const article = findArticle(slug);
  if (!article) return {};
  const t = await getTranslations({ locale, namespace: "lbt.articles.items" });
  const title = t(`${slug}.title`);
  const description = t(`${slug}.description`);
  const path = `/${locale}/guide/${slug}`;
  return {
    // The layout template would append the brand to an already long title.
    title: { absolute: title },
    description,
    alternates: {
      canonical: path,
      languages: {
        ...Object.fromEntries(routing.locales.map((l) => [l, `/${l}/guide/${slug}`])),
        "x-default": `/${routing.defaultLocale}/guide/${slug}`,
      },
    },
    openGraph: {
      type: "article", siteName: BRAND, url: path, title, description,
      publishedTime: article.published, modifiedTime: article.updated,
      images: [{ url: "/brand/og-lbt.png", width: 1200, height: 630 }],
    },
    twitter: { card: "summary_large_image", title, description, images: ["/brand/og-lbt.png"] },
  };
}

export default async function ArticlePage({ params }: { params: Params }) {
  const { locale, slug } = await params;
  const article = findArticle(slug);
  if (!article) notFound();
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "lbt" });
  const copy = t.raw(`articles.items.${slug}`) as ArticleCopy;
  const url = `${SITE_URL}/${locale}/guide/${slug}`;
  const others = ARTICLES.filter((a) => a.slug !== slug);
  return (
    <GuideShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "Article",
                headline: copy.title,
                description: copy.description,
                inLanguage: locale,
                datePublished: article.published,
                dateModified: article.updated,
                mainEntityOfPage: url,
                image: `${SITE_URL}/brand/og-lbt.png`,
                author: { "@id": `${SITE_URL}/#org` },
                publisher: { "@id": `${SITE_URL}/#org` },
              },
              {
                "@type": "BreadcrumbList",
                itemListElement: [
                  { "@type": "ListItem", position: 1, name: BRAND, item: `${SITE_URL}/${locale}` },
                  { "@type": "ListItem", position: 2, name: t("articles.breadcrumb"), item: `${SITE_URL}/${locale}/guide` },
                  { "@type": "ListItem", position: 3, name: copy.title, item: url },
                ],
              },
            ],
          }),
        }}
      />
      <nav className="policy-crumbs" aria-label={t("articles.breadcrumb")}>
        <Link href="/guide">{t("articles.breadcrumb")}</Link>
      </nav>
      <h1>{copy.title}</h1>
      <p className="policy-meta">
        <time dateTime={article.updated}>{t("articles.updated", { date: article.updated })}</time>
      </p>
      <p className="policy-intro">{copy.intro}</p>
      {copy.sections.map((section) => (
        <section key={section.h}>
          <h2>{section.h}</h2>
          {section.p?.map((line) => <p key={line}>{fillLegalFacts(line)}</p>)}
          {section.li ? <ul>{section.li.map((line) => <li key={line}>{fillLegalFacts(line)}</li>)}</ul> : null}
        </section>
      ))}
      {copy.sources ? (
        <section>
          <h2>{copy.sources.heading}</h2>
          <ul>
            {copy.sources.links.map(({ label, url: sourceUrl }) => (
              <li key={sourceUrl}><a href={sourceUrl}>{label}</a></li>
            ))}
          </ul>
        </section>
      ) : null}
      <p className="policy-contact">
        <Link className="text-button" href="/">{t("articles.cta")} <span aria-hidden="true">↗</span></Link>
      </p>
      <ArticleLinks title={t("articles.listTitle")} items={others.map(({ slug: s }) => ({ slug: s, label: t(`articles.items.${s}.nav`) }))} />
    </GuideShell>
  );
}
