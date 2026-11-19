import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { LbtAnalytics } from "@/components/analytics/LbtAnalytics";
import { Wordmark } from "@/components/lbt/BrandMark";
import { Link } from "@/i18n/routing";
import { POLICY_SLUGS } from "@/lib/lbt/legal";
import { lbtFontVariables } from "@/lib/lbtFonts";
import "@/components/lbt/lbt.css";

/** Shared reading layout with a brand home link and policy navigation. */
export async function GuideShell({ children, alternatePath, showAnalytics = true }: {
  children: ReactNode;
  alternatePath?: string;
  showAnalytics?: boolean;
}) {
  const t = await getTranslations("lbt");
  const alternateLocale = (await getLocale()) === "en" ? "zh-TW" : "en";
  return (
    <div className={`lbt ${lbtFontVariables}`}>
      <div className="site-shell">
        <header className="topbar">
          <Link className="brand" href="/" aria-label={t("brand.homeAria")}><Wordmark /></Link>
          <nav className="policy-nav" aria-label={t("footer.linksAria")}>
            {POLICY_SLUGS.map((slug) => (
              <Link key={slug} href={`/policies/${slug}`}>{t(`policy.nav.${slug}`)}</Link>
            ))}
            {alternatePath ? (
              <Link href={alternatePath} locale={alternateLocale} hrefLang={alternateLocale} lang={alternateLocale}>
                {alternateLocale === "en" ? "English" : "繁體中文"}
              </Link>
            ) : null}
          </nav>
        </header>
        <main className="policy">
          {children}
          {showAnalytics ? <LbtAnalytics /> : null}
        </main>
      </div>
    </div>
  );
}

/** Links to guide articles, so each page passes readers (and crawlers) on to the others. */
export function ArticleLinks({ title, items }: { title: string; items: { slug: string; label: string }[] }) {
  return (
    <section className="article-links" aria-labelledby="lbt-article-links">
      <h2 id="lbt-article-links">{title}</h2>
      <ul>
        {items.map(({ slug, label }) => (
          <li key={slug}><Link href={`/guide/${slug}`}>{label}</Link></li>
        ))}
      </ul>
    </section>
  );
}
