"use client";

import { useTranslations } from "next-intl";

import { Modal } from "./Modal";
import { AwardsView } from "@/components/views/AwardsView";

export function AchievementsModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("town.modals.achv");

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("title")}
      accent="var(--amber)"
      width="min(720px, 94vw)"
      testId="achievements-modal"
    >
      <AwardsView />
    </Modal>
  );
}
