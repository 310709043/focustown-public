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
      {/* Modal context: the leaderboard's inner list reflows to 2 columns
          so more rows are visible without scrolling. The /awards full-page
          route keeps the default 1-column layout for easier vertical scan
          (2026-05-20 user feedback). */}
      <AwardsView leaderboardColumns={2} />
    </Modal>
  );
}
