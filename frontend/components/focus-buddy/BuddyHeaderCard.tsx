"use client";

import { useTranslations } from "next-intl";

import { PixelSprite } from "@/components/pixel/PixelSprite";
import type { AvatarDef } from "@/lib/pixel/sprites/avatars";

import { BuddyCard } from "./BuddyCard";

interface BuddyHeaderCardProps {
  meProfile: { name: string; avatar: AvatarDef; level: number };
  buddyProfile: { name: string; avatar: AvatarDef; level: number };
  /** The shared task tag between the two buddies, e.g. `#WRITING`. */
  sharedTag: string;
}

/**
 * Two-user header card: BuddyCard (me) | center × connector + SAME TAG
 * tag | BuddyCard (buddy). Reference: screen-buddy.jsx:L74-L88.
 */
export function BuddyHeaderCard({
  meProfile,
  buddyProfile,
  sharedTag,
}: BuddyHeaderCardProps) {
  const t = useTranslations("focus.buddy.headerCard");
  return (
    <div
      data-testid="buddy-header-card"
      className="pixel-panel relative"
      style={{ padding: 14, display: "flex", alignItems: "center", gap: 8 }}
    >
      <CornerDeco />
      <BuddyCard profile={meProfile} side="me" />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 4,
          padding: "0 8px",
        }}
      >
        <span
          className="font-silkscreen"
          style={{
            fontSize: 18,
            color: "var(--accent-2)",
            textShadow: "var(--neon-glow-pink)",
          }}
        >
          ×
        </span>
        <PixelSprite
          sprite={`
.YYY.
YBYBY
.YYY.
`}
          palette={{ Y: "var(--accent-2)", B: "transparent" }}
          scale={2}
        />
        <span
          className="font-silkscreen"
          style={{
            fontSize: 8,
            color: "var(--ink-dim)",
            letterSpacing: "0.2em",
          }}
        >
          {t("sameTagLabel")}
        </span>
        <span
          className="font-silkscreen"
          style={{
            fontSize: 9,
            color: "var(--accent)",
            letterSpacing: "0.1em",
          }}
        >
          {sharedTag}
        </span>
      </div>
      <BuddyCard profile={buddyProfile} side="buddy" />
    </div>
  );
}

/** L-bracket 4-corner frame — same pattern as Page 1 / 2 / 4. */
function CornerDeco({ color = "var(--accent)" }: { color?: string }) {
  const base = { position: "absolute", width: 12, height: 12 } as const;
  return (
    <>
      <span aria-hidden style={{ ...base, top: -1, left: -1, borderTop: `2px solid ${color}`, borderLeft: `2px solid ${color}` }} />
      <span aria-hidden style={{ ...base, top: -1, right: -1, borderTop: `2px solid ${color}`, borderRight: `2px solid ${color}` }} />
      <span aria-hidden style={{ ...base, bottom: -1, left: -1, borderBottom: `2px solid ${color}`, borderLeft: `2px solid ${color}` }} />
      <span aria-hidden style={{ ...base, bottom: -1, right: -1, borderBottom: `2px solid ${color}`, borderRight: `2px solid ${color}` }} />
    </>
  );
}
