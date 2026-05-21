"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { FriendsView } from "@/components/profile/friends/FriendsView";
import { NotesView } from "@/components/profile/notes/NotesView";
import { ProfileSidebar } from "@/components/profile/ProfileSidebar";
import { SettingsView } from "@/components/profile/settings/SettingsView";
import { StatsView } from "@/components/profile/StatsView";
import { SupportView } from "@/components/profile/support/SupportView";
import { WalletView } from "@/components/profile/wallet/WalletView";
import { useUserStats } from "@/lib/hooks/useUserStats";
import { useAuthStore } from "@/lib/state/authStore";
import type { TownModalKind } from "@/components/town/scene/TownTopHUD";

export type ProfileView =
  | "stats"
  | "wallet"
  | "notes"
  | "friends"
  | "settings"
  | "feedback"
  | "support";

interface ProfileModalProps {
  open: boolean;
  onClose: () => void;
  /** When a sidebar item maps to an existing town modal, the modal
   *  closes itself and asks the host to open the routed modal instead.
   *  Items with no real destination yet render an in-place stub. */
  onRouteToModal?: (kind: TownModalKind) => void;
}

/** Profile rail items that already have a dedicated town modal — clicking
 *  them closes this modal and opens the routed one. `friends` now stays
 *  inside the profile modal (renders FriendsView); `notes` and `wallet`
 *  also stay in-modal. */
const ROUTED_VIEWS: Partial<Record<ProfileView, TownModalKind>> = {
  feedback: "feedback",
};

export function ProfileModal({ open, onClose, onRouteToModal }: ProfileModalProps) {
  const [activeView, setActiveView] = useState<ProfileView>("stats");
  const user = useAuthStore((s) => s.user);
  const stats = useUserStats(user);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  useEffect(() => {
    if (open) setActiveView("stats");
  }, [open]);

  const handleSelectView = (view: ProfileView) => {
    const routed = ROUTED_VIEWS[view];
    if (routed && onRouteToModal) {
      onClose();
      onRouteToModal(routed);
      return;
    }
    setActiveView(view);
  };

  if (!open) return null;

  return (
    <div
      data-testid="profile-modal-backdrop"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        background: "rgba(1,0,10,0.88)",
        backdropFilter: "blur(12px)",
      }}
    >
      <div
        data-testid="profile-modal"
        onClick={(e) => e.stopPropagation()}
        className="pixel-panel relative"
        style={{
          width: "min(1120px, 96vw)",
          height: "min(720px, 92vh)",
          display: "grid",
          gridTemplateColumns: "240px 1fr",
          gridTemplateRows: "1fr",
          padding: 0,
          background: "rgba(12,5,35,0.96)",
          boxShadow:
            "0 0 0 1px var(--panel-stroke-strong), 0 24px 80px rgba(0,0,0,0.6), 0 0 60px rgba(167,139,250,0.18)",
          overflow: "hidden",
        }}
      >
        <ProfileSidebar
          activeView={activeView}
          onSelectView={handleSelectView}
          level={stats.level}
          xp={stats.xp}
          xpNextLevel={stats.xpNextLevel}
          onReplayTutorial={onClose}
        />
        <RightPane
          activeView={activeView}
          onClose={onClose}
          onBackToStats={() => setActiveView("stats")}
          onOpenFeedback={() => {
            onClose();
            onRouteToModal?.("feedback");
          }}
        />
      </div>
    </div>
  );
}

interface RightPaneProps {
  activeView: ProfileView;
  onClose: () => void;
  onBackToStats: () => void;
  onOpenFeedback: () => void;
}

function RightPane({
  activeView,
  onClose,
  onBackToStats,
  onOpenFeedback,
}: RightPaneProps) {
  if (activeView === "stats") {
    return <StatsView onClose={onClose} />;
  }
  if (activeView === "wallet") {
    return <WalletView onClose={onClose} />;
  }
  if (activeView === "notes") {
    return <NotesView onClose={onClose} />;
  }
  if (activeView === "friends") {
    return <FriendsView onClose={onClose} />;
  }
  if (activeView === "settings") {
    return <SettingsView onClose={onClose} />;
  }
  if (activeView === "support") {
    return (
      <SupportView onClose={onClose} onOpenFeedback={onOpenFeedback} />
    );
  }
  return <StubView onClose={onClose} onBackToStats={onBackToStats} />;
}

function StubView({
  onClose,
  onBackToStats,
}: {
  onClose: () => void;
  onBackToStats: () => void;
}) {
  const tStub = useTranslations("profile.stub");
  const tModal = useTranslations("profile.modal");

  return (
    <div
      data-testid="profile-stub-view"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        padding: "20px 24px",
        overflowY: "auto",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={tModal("closeAria")}
          className="font-silkscreen"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 12px",
            fontSize: 11,
            letterSpacing: "0.25em",
            color: "var(--ink-mute)",
            background: "transparent",
            border: "1px solid var(--panel-stroke)",
            cursor: "pointer",
          }}
        >
          ✕ {tModal("close")}
        </button>
      </header>

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 14,
          textAlign: "center",
          padding: 32,
        }}
      >
        <span
          aria-hidden
          className="font-pixel animate-blinkSoft"
          style={{
            fontSize: 14,
            letterSpacing: "0.35em",
            color: "var(--accent)",
            textShadow: "var(--neon-glow)",
          }}
        >
          ◌ {tStub("title")}
        </span>
        <p
          className="font-silkscreen"
          style={{
            margin: 0,
            maxWidth: 420,
            fontSize: 12,
            lineHeight: 1.6,
            letterSpacing: "0.1em",
            color: "var(--ink-mute)",
          }}
        >
          {tStub("description")}
        </p>
        <button
          type="button"
          onClick={onBackToStats}
          className="pixel-btn"
          style={{
            padding: "8px 16px",
            fontSize: 11,
            letterSpacing: "0.25em",
          }}
        >
          ◀ {tStub("ctaBack")}
        </button>
      </div>
    </div>
  );
}
