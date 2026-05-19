"use client";

import { useTranslations } from "next-intl";

import { PixelSprite } from "@/components/pixel/PixelSprite";
import { PixelWord } from "@/components/pixel/PixelWord";
import { XpBar } from "@/components/profile/XpBar";
import { ProfileNavItem } from "@/components/profile/ProfileNavItem";
import { useRouter } from "@/i18n/routing";
import { useAuthStore } from "@/lib/state/authStore";
import { characterKeyToAvatar } from "@/lib/data/character-to-avatar";
import type { ProfileView } from "@/components/modals/ProfileModal";

interface ProfileSidebarProps {
  activeView: ProfileView;
  onSelectView: (view: ProfileView) => void;
  level: number;
  xp: number;
  xpNextLevel: number;
}

export function ProfileSidebar({
  activeView,
  onSelectView,
  level,
  xp,
  xpNextLevel,
}: ProfileSidebarProps) {
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const router = useRouter();
  const tSidebar = useTranslations("profile.sidebar");
  const tNav = useTranslations("profile.nav");
  const avatar = characterKeyToAvatar(user?.character_key ?? null);

  const handleSignOut = () => {
    signOut();
    router.replace("/signin");
  };

  return (
    <aside
      data-testid="profile-sidebar"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 18,
        padding: "22px 18px 18px",
        background: "rgba(7,4,26,0.95)",
        borderRight: "1px dashed var(--panel-stroke-strong)",
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div
          style={{
            position: "relative",
            width: 112,
            height: 112,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.55)",
            border: "1px solid var(--accent-2)",
            boxShadow: "0 0 18px rgba(244,114,182,0.35)",
          }}
        >
          <PixelSprite sprite={avatar.sprite} palette={avatar.palette} scale={5} />
          <span
            aria-hidden
            style={{
              position: "absolute",
              right: -4,
              bottom: -4,
              width: 12,
              height: 12,
              background: "#6ee7b7",
              border: "2px solid #07041a",
            }}
          />
        </div>

        <PixelWord
          text={(user?.display_name ?? "CITIZEN").toUpperCase()}
          scale={2}
          color="var(--accent)"
          glow="var(--accent-2)"
        />

        <div
          className="font-silkscreen"
          style={{
            fontSize: 10,
            color: "var(--ink-mute)",
            letterSpacing: "0.25em",
            textAlign: "center",
          }}
        >
          {(user?.role_label ?? avatar.name ?? tSidebar("metaUnknown"))}
          {" · "}
          {tSidebar("levelLabel", { level })}
        </div>

        <XpBar
          xp={xp}
          xpNext={xpNextLevel}
          ariaLabel={tSidebar("xpAria")}
          label={tSidebar("xpLabel", {
            current: xp.toLocaleString(),
            next: xpNextLevel.toLocaleString(),
          })}
          style={{ width: "100%" }}
        />
      </div>

      <nav
        aria-label="profile sections"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 2,
          marginTop: 6,
        }}
      >
        <ProfileNavItem
          testId="profile-nav-stats"
          icon={<span style={{ color: "var(--accent)" }}>▤</span>}
          label={tNav("stats")}
          active={activeView === "stats"}
          onClick={() => onSelectView("stats")}
        />
        <ProfileNavItem
          testId="profile-nav-notes"
          icon={<span>✎</span>}
          label={tNav("notes")}
          active={activeView === "notes"}
          onClick={() => onSelectView("notes")}
        />
        <ProfileNavItem
          testId="profile-nav-friends"
          icon={<span>♟</span>}
          label={tNav("friends")}
          active={activeView === "friends"}
          onClick={() => onSelectView("friends")}
        />
        <ProfileNavItem
          testId="profile-nav-settings"
          icon={<span>⚙</span>}
          label={tNav("settings")}
          active={activeView === "settings"}
          onClick={() => onSelectView("settings")}
        />
        <ProfileNavItem
          testId="profile-nav-feedback"
          icon={<span>✍</span>}
          label={tNav("feedback")}
          active={activeView === "feedback"}
          onClick={() => onSelectView("feedback")}
        />
        <ProfileNavItem
          testId="profile-nav-support"
          icon={<span>?</span>}
          label={tNav("support")}
          active={activeView === "support"}
          onClick={() => onSelectView("support")}
        />
      </nav>

      <button
        type="button"
        data-testid="profile-sign-out"
        className="pixel-btn"
        onClick={handleSignOut}
        style={{
          marginTop: "auto",
          width: "100%",
          padding: "10px 12px",
          fontSize: 11,
          letterSpacing: "0.3em",
          color: "#f472b6",
          borderColor: "#f472b6",
          textShadow: "0 0 6px #f472b6",
        }}
      >
        ⏻ {tSidebar("signOut")}
      </button>
    </aside>
  );
}
