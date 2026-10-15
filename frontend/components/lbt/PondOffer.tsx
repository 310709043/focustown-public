import Image from "next/image";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/routing";
import { POND_OFFER, POND_PREVIEW, POND_PURCHASE_URL } from "@/lib/lbt/pond";

const FACTS = ["price", "delivery", "devices", "desktop", "scope", "refund"] as const;

/**
 * What the koi pond is and what buying it means, above the code form on
 * /unlock. The buy link appears only once POND_PURCHASE_URL is set; payment
 * happens on Buy Me a Coffee, never here.
 */
export async function PondOffer({ purchaseUrl = POND_PURCHASE_URL }: { purchaseUrl?: string | null }) {
  const t = await getTranslations("lbt.unlock");
  const values = {
    price: POND_OFFER.priceUsd,
    hours: POND_OFFER.codeHours,
    devices: POND_OFFER.devices,
    days: POND_OFFER.refundDays,
  };
  return (
    <section className="pond-offer" aria-labelledby="lbt-pond-title">
      <h1 id="lbt-pond-title">{t("title")}</h1>
      <p>{t("intro")}</p>
      {/* already a small WebP; there is no image optimiser on the Cloudflare build */}
      <Image
        className="pond-preview"
        src={POND_PREVIEW.src}
        width={POND_PREVIEW.width}
        height={POND_PREVIEW.height}
        alt={t("previewAlt")}
        unoptimized
        priority
      />
      <h2>{t("factsTitle")}</h2>
      <ul>
        {FACTS.map((fact) => (
          <li key={fact}>{t(`facts.${fact}`, values)}</li>
        ))}
      </ul>
      {/* the terms describe the pond only while it is on sale (lib/lbt/legal policySections) */}
      {purchaseUrl ? (
        <p className="pond-buy">
          <a className="pond-buy-link" href={purchaseUrl} target="_blank" rel="noopener noreferrer">
            {t("buy")} <span aria-hidden="true">↗</span>
          </a>
          <Link href="/policies/terms">{t("terms")}</Link>
        </p>
      ) : (
        <p className="pond-buy pond-soon">{t("notOnSale")}</p>
      )}
    </section>
  );
}
