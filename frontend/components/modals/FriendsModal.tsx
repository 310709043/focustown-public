"use client";

import { useTranslations } from "next-intl";

import { Modal } from "./Modal";
import { FriendsView } from "@/components/profile/friends/FriendsView";

/**
 * Friends modal — town-page entry into the canonical FriendsView so the
 * user can search by ID, accept / decline pending requests, and share
 * their own deep link without leaving the city scene.
 *
 * The "Find Buddy" CTA from the previous round was a fallback while
 * FriendsView was incomplete; it now lives inside FriendsView's invite
 * form so a single search → invite path is the only flow.
 */
export function FriendsModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
  /** @deprecated kept for call-site compatibility; FriendsView owns the
   *  invite UX now and there's no separate "find buddy" branch. */
  onFindBuddy?: () => void;
}) {
  const t = useTranslations("town.modals.frds");

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("title")}
      accent="var(--accent-2)"
      width="min(640px, 92vw)"
      testId="friends-modal"
    >
      <FriendsView onClose={onClose} />
    </Modal>
  );
}
