import Image from "next/image";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/routing";
import { LOOKS_OFFER, LOOKS_PURCHASE_URL, STYLES } from "@/lib/lbt/looksOffer";

const LOOKS = [
  { id: "rain", src: "/lbt/looks/rain-town.webp", width: 1000, height: 660 },
  ...STYLES.map((id) => ({ id, src: `/lbt/looks/style-${id}.webp`, width: 1000, height: 598 })),
] as const;

const FACTS = ["price", "pick", "delivery", "devices", "scope", "refund"] as const;

/**
 * 下雨的小鎮 and the four style packs on /unlock, shown only while they are
 * on sale (LOOKS_PURCHASE_URL). Payment happens on Buy Me a Coffee, never
 * here; the buyer names the look there and gets a code by e-mail.
 */
export async function LooksOffer({ purchaseUrl = LOOKS_PURCHASE_URL }: { purchaseUrl?: string | null }) {
  if (!purchaseUrl) return null;
  const t = await getTranslations("lbt.looksOffer");
  const values = {
    price: LOOKS_OFFER.priceUsd,
    hours: LOOKS_OFFER.codeHours,
    devices: LOOKS_OFFER.devices,
    days: LOOKS_OFFER.refundDays,
  };
  return (
    <section className="looks-offer" id="looks" aria-labelledby="lbt-looks-title">
      <h2 id="lbt-looks-title">{t("title")}</h2>
      <p>{t("intro")}</p>
      <ul className="looks-grid">
        {LOOKS.map((look) => (
          <li key={look.id}>
            {/* already small WebP files; there is no image optimiser on the Cloudflare build */}
            <Image src={look.src} width={look.width} height={look.height} alt={t(`items.${look.id}.alt`)} unoptimized />
            <strong>{t(`items.${look.id}.name`)}</strong>
            <span>{t(`items.${look.id}.text`)}</span>
            <em>{t("each", values)}</em>
          </li>
        ))}
      </ul>
      <h3>{t("factsTitle")}</h3>
      <ul>
        {FACTS.map((fact) => (
          <li key={fact}>{t(`facts.${fact}`, values)}</li>
        ))}
      </ul>
      <p className="pond-buy">
        <a className="pond-buy-link" href={purchaseUrl} target="_blank" rel="noopener noreferrer">
          {t("buy")} <span aria-hidden="true">↗</span>
        </a>
        <Link href="/policies/terms">{t("terms")}</Link>
      </p>
    </section>
  );
}
