"use client";

import { useEffect, useMemo, useState } from "react";
import type { StreetUser } from "@/lib/api/types.gen";
import { CHARACTERS, findCharacter, type CharacterDef } from "@/lib/data/characters";
import { statusByCode, type StatusCode } from "@/lib/data/statuses";
import { useAuthStore } from "@/lib/state/authStore";
import { usePresenceStore } from "@/lib/state/presenceStore";

/**
 * Real online users walking the street. Each <Pedestrian> manages its own
 * jitter / leg phase so adding & removing users from the parent list doesn't
 * thrash sibling timers. CSS animations (legs / pedWalk / statusPop / userPop)
 * carry the visual feel; data driving them is now live from `presenceStore`.
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

function Pedestrian({ user, isSelf }: { user: StreetUser; isSelf: boolean }) {
  const [x, setX] = useState<number>(() => pickPos());
  // Each pedestrian gets a stable leg-phase so they don't all stomp in sync.
  const walkPhase = useMemo(() => Math.random() * 0.5, []);

  useEffect(() => {
    const id = setInterval(
      () => setX(pickPos()),
      (3.5 + Math.random() * 2.5) * 1000,
    );
    return () => clearInterval(id);
  }, []);

  const ch = findCharacter(user.character_key) ?? fallbackCharacter(user.id);
  const status = statusByCode((user.status as StatusCode) || "focus");

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
        className="animate-statusPop"
        style={{
          position: "absolute",
          bottom: 32,
          left: "50%",
          transform: "translateX(-50%)",
          background: "rgba(3,1,17,0.92)",
          border: `1px solid ${status.color}`,
          color: status.color,
          fontSize: 9,
          padding: "1.5px 6px",
          borderRadius: 99,
          whiteSpace: "nowrap",
          boxShadow: `0 0 10px ${status.color}55`,
          textShadow: `0 0 4px ${status.color}`,
        }}
      >
        {status.emoji} {status.label}
      </div>

      {/* name plate — self gets amber accent so you find yourself instantly */}
      <div
        style={{
          fontSize: 7,
          color: isSelf ? "var(--amber)" : "var(--a2)",
          textAlign: "center",
          textShadow: isSelf
            ? "0 0 6px var(--amber), 0 0 12px rgba(252,211,77,0.55)"
            : "0 0 4px var(--a3)",
          marginBottom: 1,
          whiteSpace: "nowrap",
          letterSpacing: isSelf ? "0.5px" : "normal",
        }}
      >
        {isSelf ? `${ch.name} ・ 你` : ch.name}
      </div>

      {/* head — self carries a slow amber halo (animate-selfHalo) */}
      <div
        className={isSelf ? "animate-pedWalk animate-selfHalo" : "animate-pedWalk"}
        style={{
          width: 10,
          height: 10,
          margin: "0 auto",
          background: ch.bodyColor,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 8,
          borderRadius: 1,
        }}
      >
        {ch.emoji}
      </div>
      {/* body */}
      <div
        style={{
          width: 10,
          height: 9,
          margin: "0 auto",
          background: ch.bodyColor,
          filter: "brightness(0.8)",
        }}
      />
      {/* legs */}
      <div
        className="flex w-[10px] mx-auto animate-legs"
        style={
          {
            gap: 1,
            ["--ld" as string]: `${walkPhase}s`,
          } as React.CSSProperties
        }
      >
        <div className="flex-1 h-1.5" style={{ background: ch.roofColor }} />
        <div className="flex-1 h-1.5" style={{ background: ch.roofColor }} />
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
