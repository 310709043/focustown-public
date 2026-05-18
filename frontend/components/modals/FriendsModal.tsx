"use client";

import { useTranslations } from "next-intl";

import { Modal } from "./Modal";
import { PixelSprite } from "@/components/pixel/PixelSprite";
import { CAT_WALK } from "@/lib/pixel/sprites/walkers";

/**
 * Friends modal — round 2 placeholder. Renders the chrome + an empty
 * state with a CTA that closes the modal and triggers the parent's
 * `onFindBuddy` handler so the user can pivot from "I clicked Friends
 * and nothing showed" to "OK let me match with someone instead".
 *
 * Wired into `app/[locale]/town/page.tsx`'s `openModal` switch the same
 * way other modals are. Real friends data lands in a follow-up round
 * once the backend `/friends` endpoint exists.
 */
export function FriendsModal({
  open,
  onClose,
  onFindBuddy,
}: {
  open: boolean;
  onClose: () => void;
  onFindBuddy?: () => void;
}) {
  const t = useTranslations("town.modals.frds");

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("title")}
      accent="var(--accent-2)"
      width="min(480px, 92vw)"
      testId="friends-modal"
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 18,
          padding: "12px 8px 4px",
          textAlign: "center",
        }}
      >
        <div
          aria-hidden
          style={{
            opacity: 0.6,
            padding: 8,
            border: "1px dashed var(--panel-stroke)",
          }}
        >
          <PixelSprite
            sprite={CAT_WALK.frames[0]}
            palette={CAT_WALK.palette}
            scale={3}
          />
        </div>
        <h3
          className="font-silkscreen"
          style={{
            fontSize: 14,
            color: "var(--ink)",
            letterSpacing: "0.15em",
            margin: 0,
          }}
        >
          {t("heading")}
        </h3>
        <p
          style={{
            fontSize: "var(--font-size-note)",
            lineHeight: 1.7,
            color: "var(--ink-mute)",
            maxWidth: 360,
            margin: 0,
          }}
        >
          {t("body")}
        </p>
        <div
          style={{
            display: "flex",
            gap: 10,
            marginTop: 4,
          }}
        >
          {onFindBuddy ? (
            <button
              type="button"
              data-testid="friends-modal-find-buddy"
              className="pixel-btn primary"
              style={{ padding: "10px 18px", fontSize: 12 }}
              onClick={() => {
                onClose();
                onFindBuddy();
              }}
            >
              ✦ {t("findBuddyCta")}
            </button>
          ) : null}
          <button
            type="button"
            data-testid="friends-modal-close"
            className="pixel-btn"
            style={{ padding: "10px 18px", fontSize: 12 }}
            onClick={onClose}
          >
            {t("doneCta")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
