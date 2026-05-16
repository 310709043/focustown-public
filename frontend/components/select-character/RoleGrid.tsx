"use client";

import { AVATARS } from "@/lib/pixel/sprites/avatars";

import { AvatarCell } from "./AvatarCell";

interface RoleGridProps {
  selected: string;
  onSelect: (avatarId: string) => void;
}

/**
 * 30-avatar selectable grid. Reference uses `auto-fill` with a min
 * column width of 108 px — preserved verbatim so the grid reflows
 * identically across the right column's available width.
 */
export function RoleGrid({ selected, onSelect }: RoleGridProps) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(108px, 1fr))",
        gap: 8,
        marginTop: 8,
      }}
    >
      {AVATARS.map((a) => (
        <AvatarCell
          key={a.id}
          avatar={a}
          selected={selected === a.id}
          onSelect={() => onSelect(a.id)}
        />
      ))}
    </div>
  );
}
