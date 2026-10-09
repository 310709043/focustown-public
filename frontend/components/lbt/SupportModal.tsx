"use client";

import { useTranslations } from "next-intl";

import { LBT_LEGAL } from "@/lib/lbt/legal";
import { useLbtStore } from "@/lib/lbt/sessionStore";
import { SUPPORT_PAGE_URL, SUPPORT_REFUND_URL } from "@/lib/lbt/support";

import { LbtModal } from "./LbtModal";

/** Voluntary support on the creator's external page; no payment data is collected here. */
export function SupportModal() {
  const t = useTranslations("lbt.modal.support");
  const closeModal = useLbtStore((s) => s.closeModal);

  const confirm = () => {
    window.open(SUPPORT_PAGE_URL, "_blank", "noopener,noreferrer");
    closeModal();
  };

  return (
    <LbtModal
      eyebrow={t("eyebrow")}
      title={t("title")}
      confirmLabel={t("checkout")}
      onConfirm={confirm}
      onClose={closeModal}
    >
      <svg className="support-lamp" viewBox="0 0 40 44" width="40" height="44" aria-hidden="true" focusable="false">
        <path d="M20 41V10M12 41h16M11 10h18L25 3H15Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path className="support-lamp-light" d="M14 13h12l5 17H9Z" fill="var(--lamp)" />
      </svg>
      <p>{t("intro")}</p>
      <div className="support-total">
        <span>{t("totalLabel")}</span>
        <strong>1 Power · US$5</strong>
      </div>
      <p className="support-once">{t("once")}</p>
      <p>{t("usage")}</p>
      <p className="support-disclosure">{t("disclosure")}</p>
      <p>{t("operator")} <a href={`mailto:${LBT_LEGAL.contactEmail}`}>{LBT_LEGAL.contactEmail}</a></p>
      <p>
        {t("refund")} {" "}
        <a href={SUPPORT_REFUND_URL} target="_blank" rel="noopener noreferrer">{t("refundLink")}</a>
      </p>
    </LbtModal>
  );
}
