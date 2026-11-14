"use client";

import { useTranslations } from "next-intl";

import { Link } from "@/i18n/routing";
import { LOOKS_ON_SALE, useEffectiveLooks, useLooks } from "@/lib/lbt/looks";

/**
 * 外觀: switch the paid looks this device owns (rain on the street, one
 * style pack) and, while they are on sale, a link to the others on /unlock.
 * Renders nothing for a visitor who owns none and when none are on sale.
 * `place` picks the desktop copy (stage top line) or the phone copy (under
 * the hero text); CSS shows one.
 */
export function LooksMenu({ place, onSale = LOOKS_ON_SALE }: { place: "stage" | "phone"; onSale?: boolean }) {
  const t = useTranslations("lbt.looks");
  const { ownsRain, ownedStyles, rain, style } = useEffectiveLooks();
  const setStyle = useLooks((s) => s.setStyle);
  const setRain = useLooks((s) => s.setRain);
  const owns = ownsRain || ownedStyles.length > 0;
  if (!owns && !onSale) return null;
  if (!owns) {
    return (
      <Link href="/unlock#looks" className={`looks-menu looks-${place} is-offer`}>
        {t("more")}
      </Link>
    );
  }
  const group = `lbt-look-style-${place}`;
  return (
    <details className={`looks-menu looks-${place}`}>
      <summary>{t("title")}</summary>
      <div className="looks-panel">
        {ownsRain ? (
          <label className="looks-switch">
            <input type="checkbox" checked={rain} onChange={(event) => setRain(event.target.checked)} />
            <span>{t("rain")}</span>
          </label>
        ) : null}
        {ownedStyles.length ? (
          <fieldset>
            <legend>{t("style")}</legend>
            {(["original", ...ownedStyles] as const).map((value) => (
              <label key={value}>
                <input
                  type="radio"
                  name={group}
                  value={value}
                  checked={(style ?? "original") === value}
                  onChange={() => setStyle(value)}
                />
                <span>{t(`styles.${value}`)}</span>
              </label>
            ))}
          </fieldset>
        ) : null}
        {onSale ? (
          <Link href="/unlock#looks" className="looks-more">
            {t("more")}
          </Link>
        ) : null}
      </div>
    </details>
  );
}
