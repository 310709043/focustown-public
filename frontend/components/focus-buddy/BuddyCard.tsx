"use client";

import { PixelSprite } from "@/components/pixel/PixelSprite";
import type { AvatarDef } from "@/lib/pixel/sprites/avatars";

import { Pill } from "./Pill";

interface BuddyCardProps {
  /** Sprite + name + role/level metadata. */
  profile: {
    name: string;
    avatar: AvatarDef;
    level: number;
  };
  /** `me` = purple accent glow + accent text; `buddy` = pink accent-2. */
  side: "me" | "buddy";
  /** Tomato count + minutes — defaults to per-side seed when omitted. */
  tomatoes?: number;
  minutes?: number;
  /** Tags rendered as `<Pill>` chips. Reference shows `#寫作`, `#lofi`. */
  tags?: ReadonlyArray<string>;
}

/**
 * One half of `<BuddyHeaderCard>` — pixel sprite with side-colored glow,
 * green presence dot, name + role/level, 2 task pills, tomato + minutes
 * stats. Reference: screen-buddy.jsx:L230-L252.
 */
export function BuddyCard({
  profile,
  side,
  tomatoes,
  minutes,
  tags = ["#寫作", "#lofi"],
}: BuddyCardProps) {
  const isMe = side === "me";
  const color = isMe ? "var(--accent)" : "var(--accent-2)";
  const defaultTomatoes = isMe ? 9 : 11;
  const defaultMinutes = isMe ? 142 : 275;
  return (
    <div
      data-testid={`buddy-card-${side}`}
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        alignItems: "center",
        padding: 6,
      }}
    >
      <div style={{ position: "relative" }}>
        <PixelSprite
          sprite={profile.avatar.sprite}
          palette={profile.avatar.palette}
          scale={3}
          glow={color}
        />
        <span
          aria-hidden
          style={{
            position: "absolute",
            bottom: -2,
            right: -2,
            width: 10,
            height: 10,
            background: "#06d6a0",
            border: "2px solid var(--bg-0)",
          }}
        />
      </div>
      <div
        className="font-silkscreen"
        style={{ fontSize: 13, color, textShadow: `0 0 6px ${color}` }}
      >
        {profile.name}
      </div>
      <div
        className="font-silkscreen"
        style={{
          fontSize: 9,
          color: "var(--ink-mute)",
          letterSpacing: "0.15em",
        }}
      >
        {profile.avatar.name} · LV.{profile.level}
      </div>
      <div style={{ display: "flex", gap: 4, marginTop: 2 }}>
        {tags.map((tag) => (
          <Pill key={tag}>{tag}</Pill>
        ))}
      </div>
      <div
        className="font-silkscreen"
        style={{
          display: "flex",
          gap: 6,
          marginTop: 4,
          fontSize: 9,
          color: "var(--ink-mute)",
        }}
      >
        <span>🍅 {tomatoes ?? defaultTomatoes}</span>
        <span>·</span>
        <span>⏱ {minutes ?? defaultMinutes}min</span>
      </div>
    </div>
  );
}
