"use client";

import { useTranslations } from "next-intl";

import { PixelSprite } from "@/components/pixel/PixelSprite";
import type { AvatarDef } from "@/lib/pixel/sprites/avatars";

import { Chip } from "./Chip";

interface PreviewCardProps {
  avatar: AvatarDef;
  /** Live nickname text — falls back to "???" when blank. */
  name: string;
  /** Numeric age — flows into the third caption chip. */
  age: number;
}

/**
 * Left-column hero card. 92×92 sprite head on the left, citizen-ID
 * metadata on the right (small label / live nickname / role / chips).
 * Reference adds an L-bracket frame (`CornerDeco`) — reproduced inline
 * here so Page 2 doesn't depend on a component that may live on a
 * separate branch (Page 1's `components/login/CornerDeco.tsx`).
 */
export function PreviewCard({ avatar, name, age }: PreviewCardProps) {
  const t = useTranslations("characters.selectPage");
  return (
    <div
      className="pixel-panel relative"
      style={{
        padding: 14,
        display: "flex",
        gap: 14,
        alignItems: "center",
      }}
    >
      <CornerDeco />
      <div
        style={{
          width: 92,
          height: 92,
          background: "rgba(0,0,0,0.4)",
          border: "2px solid var(--accent)",
          boxShadow: "var(--neon-glow)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <PixelSprite sprite={avatar.sprite} palette={avatar.palette} scale={5} />
      </div>
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        <div
          className="font-silkscreen"
          style={{
            fontSize: 9,
            color: "var(--ink-mute)",
            letterSpacing: "0.2em",
          }}
        >
          {t("previewCitizenId")}
        </div>
        <div
          className="font-silkscreen"
          style={{
            fontSize: 20,
            color: "var(--ink)",
            minHeight: 24,
            textShadow: "var(--neon-glow)",
          }}
        >
          {name || t("previewIdBlank")}
        </div>
        <div
          className="font-silkscreen"
          style={{ fontSize: 11, color: "var(--accent-3)" }}
        >
          {avatar.name}
        </div>
        <div
          style={{
            display: "flex",
            gap: 4,
            marginTop: 4,
            flexWrap: "wrap",
          }}
        >
          <Chip>LV.1</Chip>
          <Chip>{age} y/o</Chip>
          <Chip color="var(--accent-3)">NEW</Chip>
        </div>
      </div>
    </div>
  );
}

/** Inline 4-corner L-bracket frame — same shape as Page 1's CornerDeco. */
function CornerDeco({ color = "var(--accent)" }: { color?: string }) {
  const c = { position: "absolute", width: 12, height: 12 } as const;
  return (
    <>
      <span aria-hidden style={{ ...c, top: -1, left: -1, borderTop: `2px solid ${color}`, borderLeft: `2px solid ${color}` }} />
      <span aria-hidden style={{ ...c, top: -1, right: -1, borderTop: `2px solid ${color}`, borderRight: `2px solid ${color}` }} />
      <span aria-hidden style={{ ...c, bottom: -1, left: -1, borderBottom: `2px solid ${color}`, borderLeft: `2px solid ${color}` }} />
      <span aria-hidden style={{ ...c, bottom: -1, right: -1, borderBottom: `2px solid ${color}`, borderRight: `2px solid ${color}` }} />
    </>
  );
}
