import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { Wordmark } from "@/components/lbt/BrandMark";
import { Link } from "@/i18n/routing";
import { POLICY_SLUGS } from "@/lib/lbt/legal";
import { lbtFontVariables } from "@/lib/lbtFonts";
import "@/components/lbt/lbt.css";

/** Page chrome for the guide and its articles: brand home link, policy links, a reading column. */
export async function GuideShell({ children }: { children: ReactNode }) {
  const t = await getTranslations("lbt");
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
        <main className="policy">{children}</main>
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
