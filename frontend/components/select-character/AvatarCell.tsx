"use client";

import { PixelSprite } from "@/components/pixel/PixelSprite";
import type { AvatarDef } from "@/lib/pixel/sprites/avatars";

interface AvatarCellProps {
  avatar: AvatarDef;
  selected: boolean;
  onSelect: () => void;
}

/**
 * Role grid cell — pixel sprite + role name + selected halo + ✓ overlay.
 * Reference styles the selected state with a glow ring and a ✓ badge in
 * the upper-right; both honored here.
 */
export function AvatarCell({ avatar, selected, onSelect }: AvatarCellProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      title={avatar.name}
      data-selected={selected || undefined}
      className="font-silkscreen"
      style={{
        background: selected ? "rgba(183,148,246,0.15)" : "rgba(0,0,0,0.35)",
        border: `2px solid ${selected ? "var(--accent)" : "var(--panel-stroke)"}`,
        padding: 8,
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
        boxShadow: selected ? "var(--neon-glow)" : "none",
        transition: "all 0.12s steps(2)",
        position: "relative",
      }}
    >
      <PixelSprite sprite={avatar.sprite} palette={avatar.palette} scale={2.5} />
      <div
        style={{
          fontSize: 9,
          color: selected ? "var(--accent)" : "var(--ink-mute)",
          textAlign: "center",
          letterSpacing: "0.05em",
        }}
      >
        {avatar.name}
      </div>
      {selected ? (
        <span
          aria-hidden
          style={{
            position: "absolute",
            top: -8,
            right: -8,
            width: 16,
            height: 16,
            background: "var(--accent)",
            color: "#0a0524",
            fontSize: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          ✓
        </span>
      ) : null}
    </button>
  );
}
