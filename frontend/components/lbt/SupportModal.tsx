"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { DEFAULT_SUPPORT_AMOUNT, SUPPORT_AMOUNTS } from "@/lib/lbt/constants";
import { useLbtStore } from "@/lib/lbt/sessionStore";
import { getCheckoutUrl } from "@/lib/lbt/support";
import type { SupportAmount } from "@/lib/lbt/types";

import { LbtModal } from "./LbtModal";

/**
 * "Light a lamp for the town": a single voluntary payment of NT$60 / 150 /
 * 300. Checkout stays disabled until SUPPORT_CHECKOUT_LINKS holds approved
 * provider links (lib/lbt/support.ts). No payment data is collected here.
 */
export function SupportModal() {
  const t = useTranslations("lbt.modal.support");
  const closeModal = useLbtStore((s) => s.closeModal);
  const [amount, setAmount] = useState<SupportAmount>(DEFAULT_SUPPORT_AMOUNT);

  const checkoutUrl = getCheckoutUrl(amount);
  const label = `NT$${amount}`;

  const confirm = () => {
    closeModal();
    if (checkoutUrl) window.open(checkoutUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <LbtModal
      eyebrow={t("eyebrow")}
      title={t("title")}
      confirmLabel={checkoutUrl ? t("checkout", { amount: label }) : t("unavailable")}
      confirmDisabled={!checkoutUrl}
      onConfirm={confirm}
      onClose={closeModal}
    >
      <p>{t("intro")}</p>
      <fieldset className="support-amounts">
        <legend>{t("legend")}</legend>
        {SUPPORT_AMOUNTS.map((value) => (
          <label key={value} className="support-choice">
            <input
              type="radio"
              name="support-amount"
              value={value}
              checked={amount === value}
              onChange={() => setAmount(value)}
            />
            <span>{`NT$${value}`}</span>
          </label>
        ))}
      </fieldset>
      <div className="support-total">
        <span>{t("totalLabel")}</span>
        <strong>{label}</strong>
      </div>
      <p className="support-once">{t("once")}</p>
      <p>{t("usage")}</p>
      <p className="support-disclosure">{t("disclosure")}</p>
    </LbtModal>
  );
}
