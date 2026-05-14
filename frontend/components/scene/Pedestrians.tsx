"use client";

import { useEffect, useMemo, useState } from "react";
import type { StreetUser } from "@/lib/api/types.gen";
import { CHARACTERS, findCharacter, type CharacterDef } from "@/lib/data/characters";
import { statusByCode, type StatusCode } from "@/lib/data/statuses";
import { useAuthStore } from "@/lib/state/authStore";
import { usePresenceStore } from "@/lib/state/presenceStore";

import { AnimatedSprite } from "@/components/pixel/AnimatedSprite";
import { WALKERS } from "@/lib/pixel/sprites/world";

/**
 * Real online users walking the street. Each <Pedestrian> manages its own
 * jitter so adding & removing users from the parent list doesn't thrash
 * sibling timers. CSS animations (statusPop, userPop, selfHalo) still
 * carry the mount/focus feel; the *walking figure itself* is now a
 * canvas pixel sprite from `lib/pixel/sprites/world.ts` — the WALKERS
 * 2-frame walk cycle, with its clothes/pants palette remapped to the
 * user's character body/roof color so identity survives the swap.
 */

const POSITIONS = [4, 13, 22, 32, 42, 52, 62, 72, 82, 91];

const pickPos = () => POSITIONS[Math.floor(Math.random() * POSITIONS.length)];

const fallbackCharacter = (userId: string): CharacterDef => {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) | 0;
  }
  return CHARACTERS[Math.abs(hash) % CHARACTERS.length];
};

// Stable per-user walker variant. The variant index never changes for a
// given user.id, so list reorders from WS deltas don't reshuffle walkers.
const walkerIndexFor = (userId: string): number => {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % WALKERS.length;
};

function Pedestrian({ user, isSelf }: { user: StreetUser; isSelf: boolean }) {
  const [x, setX] = useState<number>(() => pickPos());

  useEffect(() => {
    const id = setInterval(
      () => setX(pickPos()),
      (3.5 + Math.random() * 2.5) * 1000,
    );
    return () => clearInterval(id);
  }, []);

  const ch = findCharacter(user.character_key) ?? fallbackCharacter(user.id);
  const status = statusByCode((user.status as StatusCode) || "focus");
  const walker = WALKERS[walkerIndexFor(user.id)];

  // Remap walker palette so clothes (C, B) match the character's body color
  // and pants (L) match the roof color. Stable identity = stable cache key
  // in the sprite-engine LRU: `sprite + JSON.stringify(palette)`.
  const palette = useMemo(
    () => ({
      ...walker.palette,
      C: ch.bodyColor,
      B: ch.bodyColor,
      L: ch.roofColor,
    }),
    [walker.palette, ch.bodyColor, ch.roofColor],
  );

  return (
    <div
      className="absolute animate-userPop"
      style={{
        left: `${x}%`,
        bottom: 104,
        transition: "left 3.5s ease-in-out",
      }}
    >
      {/* status bubble — keyed by status code so it re-mounts and pops on change */}
      <div
        key={status.code}
        className="animate-statusPop font-japan"
        style={{
          position: "absolute",
          bottom: 56,
          left: "50%",
          transform: "translateX(-50%)",
          background: "rgba(3,1,17,0.94)",
          border: `1px solid ${status.color}`,
          color: status.color,
          fontSize: 11,
          padding: "2px 8px",
          borderRadius: 99,
          whiteSpace: "nowrap",
          boxShadow: `0 0 12px ${status.color}66, inset 0 0 4px ${status.color}33`,
          textShadow: `0 0 6px ${status.color}`,
          letterSpacing: 0.5,
        }}
      >
        {status.emoji} {status.label}
      </div>

      {/* name plate — self gets amber accent so you find yourself instantly */}
      <div
        className="font-japan"
        style={{
          fontSize: 11,
          color: isSelf ? "var(--amber)" : "var(--a2)",
          textAlign: "center",
          textShadow: isSelf
            ? "0 0 6px var(--amber), 0 0 12px rgba(252,211,77,0.55)"
            : "0 0 6px var(--a3), 0 0 10px var(--a1)",
          background: isSelf
            ? "rgba(252,211,77,0.10)"
            : "rgba(3,1,17,0.55)",
          padding: "1px 6px",
          borderRadius: 4,
          marginBottom: 2,
          whiteSpace: "nowrap",
          border: isSelf
            ? "1px solid rgba(252,211,77,0.45)"
            : "1px solid rgba(167,139,250,0.25)",
          letterSpacing: 0.5,
        }}
      >
        {isSelf ? `${ch.name} ・ 你` : ch.name}
      </div>

      {/* pixel walker (2-frame). Self carries a slow amber halo via the
          shared selfHalo keyframe; we apply it to the sprite wrapper so
          the glow surrounds the whole figure. */}
      <div className={isSelf ? "animate-selfHalo" : undefined} style={{ display: "inline-block" }}>
        <AnimatedSprite
          frames={walker.frames}
          palette={palette}
          fps={3}
          scale={3}
        />
      </div>
    </div>
  );
}

export function Pedestrians() {
  const users = usePresenceStore((s) => Object.values(s.byId));
  const selfId = useAuthStore((s) => s.user?.id ?? null);

  return (
    <div className="absolute inset-0 z-[6] pointer-events-none" aria-hidden>
      {users.map((u) => (
        <Pedestrian key={u.id} user={u} isSelf={u.id === selfId} />
      ))}
    </div>
  );
}
