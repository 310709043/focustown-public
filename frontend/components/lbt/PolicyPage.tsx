import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/routing";
import { fillLegalFacts, LBT_LEGAL, POLICY_SLUGS, type PolicySlug } from "@/lib/lbt/legal";
import { lbtFontVariables } from "@/lib/lbtFonts";

import { Wordmark } from "./BrandMark";

import "./lbt.css";

interface Section {
  h: string;
  p: string[];
}

/** Privacy policy, terms and community guidelines for LowBatteryTown. */
export async function PolicyPage({ locale, slug }: { locale: string; slug: PolicySlug }) {
  const t = await getTranslations({ locale, namespace: "lbt.policy" });
  const sections = t.raw(`${slug}.sections`) as Section[];

  return (
    <div className={`lbt ${lbtFontVariables}`}>
      <div className="site-shell">
        <header className="topbar">
          <Link className="brand" href="/" aria-label={t("nav.home")}>
            <Wordmark />
          </Link>
          <nav className="policy-nav" aria-label={t("nav.aria")}>
            {POLICY_SLUGS.map((s) => (
              <Link
                key={s}
                href={`/policies/${s}`}
                aria-current={s === slug ? "page" : undefined}
              >
                {t(`nav.${s}`)}
              </Link>
            ))}
          </nav>
        </header>
        <main className="policy">
          <h1>{t(`${slug}.title`)}</h1>
          <p className="policy-meta">{t("effective", { date: LBT_LEGAL.effectiveDate })}</p>
          <p className="policy-intro">{t(`${slug}.intro`)}</p>
          {sections.map((section) => (
            <section key={section.h}>
              <h2>{section.h}</h2>
              {section.p.length > 1 ? (
                <ul>
                  {section.p.map((line) => (
                    <li key={line}>{fillLegalFacts(line)}</li>
                  ))}
                </ul>
              ) : (
                <p>{fillLegalFacts(section.p[0] ?? "")}</p>
              )}
            </section>
          ))}
          <p className="policy-contact">
            {t("contact")}
            <a href={`mailto:${LBT_LEGAL.contactEmail}`}>{LBT_LEGAL.contactEmail}</a>
          </p>
          <Link className="text-button" href="/">
            {t("nav.home")} <span aria-hidden="true">↗</span>
          </Link>
        </main>
      </div>
    </div>
  );
}
