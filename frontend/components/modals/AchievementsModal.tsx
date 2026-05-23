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
      {/* Achievements-only popup per 2026-05-23 user feedback. The /awards
          full-page route still renders the leaderboard alongside. */}
      <AwardsView />
    </Modal>
  );
}
