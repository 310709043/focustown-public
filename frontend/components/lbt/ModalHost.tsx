"use client";

import { useTranslations } from "next-intl";

import { useLbtStore } from "@/lib/lbt/sessionStore";

import { FeedbackModal } from "./FeedbackModal";
import { LbtModal } from "./LbtModal";
import { ReportModal } from "./ReportModal";
import { SupportModal } from "./SupportModal";

/** Renders whichever dialog the session store has open. */
export function ModalHost() {
  const t = useTranslations("lbt.modal");
  const modal = useLbtStore((s) => s.modal);
  const closeModal = useLbtStore((s) => s.closeModal);
  const extend = useLbtStore((s) => s.extend);
  const leave = useLbtStore((s) => s.leave);
  const mode = useLbtStore((s) => s.mode);

  if (!modal) return null;

  switch (modal.type) {
    case "support":
      return <SupportModal />;
    case "timeUp":
      return (
        <LbtModal
          eyebrow={t("timeUp.eyebrow")}
          title={t("timeUp.title")}
          confirmLabel={t("timeUp.extend")}
          onConfirm={extend}
          secondaryLabel={t("timeUp.leave")}
          onSecondary={leave}
          onClose={closeModal}
        >
          <p>{t("timeUp.body")}</p>
        </LbtModal>
      );
    case "report":
      return <ReportModal />;
    case "feedback":
      return <FeedbackModal />;
    case "about":
      return (
        <LbtModal
          eyebrow={t("about.eyebrow")}
          title={t("about.title")}
          confirmLabel={t("gotIt")}
          onConfirm={closeModal}
          onClose={closeModal}
        >
          <p>{mode === "demo" ? t("about.body") : t("about.bodyLive")}</p>
        </LbtModal>
      );
  }
}
