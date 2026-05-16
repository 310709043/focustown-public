"use client";

import { useTranslations } from "next-intl";

import { PixelSprite } from "@/components/pixel/PixelSprite";
import type { AvatarDef } from "@/lib/pixel/sprites/avatars";

import { TypingDots } from "./TypingDots";

interface StatusMiniProps {
  meProfile: { name: string; avatar: AvatarDef; task: string };
  buddyProfile: { name: string; avatar: AvatarDef; task: string };
}

/**
 * "即時狀態" panel — 2 rows (me + buddy) each showing avatar + name +
 * `♪ {current task}` line + typing indicator. Reference:
 * screen-buddy.jsx:L121-L136.
 */
export function StatusMini({ meProfile, buddyProfile }: StatusMiniProps) {
  const t = useTranslations("focus.buddy.statusMini");
  const rows = [
    { ...meProfile, color: "var(--accent)" },
    { ...buddyProfile, color: "var(--accent-2)" },
  ];
  return (
    <div
      data-testid="status-mini"
      className="pixel-panel"
      style={{ padding: 12, display: "flex", flexDirection: "column", gap: 6 }}
    >
      <span
        className="font-silkscreen"
        style={{
          fontSize: 10,
          color: "var(--accent-3)",
          letterSpacing: "0.2em",
        }}
      >
        ● {t("header")}
      </span>
      {rows.map((r) => (
        <div
          key={r.name}
          style={{ display: "flex", alignItems: "center", gap: 8 }}
        >
          <PixelSprite sprite={r.avatar.sprite} palette={r.avatar.palette} scale={1.8} />
          <div style={{ flex: 1 }}>
            <div
              className="font-silkscreen"
              style={{ fontSize: 11, color: "var(--ink)" }}
            >
              {r.name}
            </div>
            <div
              className="font-silkscreen"
              style={{
                fontSize: 9,
                color: r.color,
                letterSpacing: "0.1em",
              }}
            >
              ♪ {r.task}
            </div>
          </div>
          <TypingDots />
        </div>
      ))}
    </div>
  );
}
