"use client";

import { useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
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

// Deterministic hash from a string — small djb2 variant. Used to pick a
// SSR-stable initial position + leg-phase per user so server and client
// render identical HTML before the post-mount randomisation kicks in.
const stableHash = (s: string): number => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};

const fallbackCharacter = (userId: string): CharacterDef => {
  return CHARACTERS[stableHash(userId) % CHARACTERS.length];
};

function Pedestrian({ user, isSelf }: { user: StreetUser; isSelf: boolean }) {
  // SSR-stable initial values: derived from user.id so server and client
  // agree on the first paint. Math.random() runs only inside useEffect.
  const h = stableHash(user.id);
  const [x, setX] = useState<number>(POSITIONS[h % POSITIONS.length]);
  const walkPhase = useMemo(() => (h % 50) / 100, [h]); // 0.00 – 0.49

  useEffect(() => {
    // First post-mount reroll so the layout doesn't look identical to
    // every other client viewing the same user list, then keep rerolling.
    setX(pickPos());
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
        className="animate-statusPop font-japan"
        style={{
          position: "absolute",
          bottom: 44,
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
  // useShallow: without this, `Object.values(s.byId)` returns a fresh array
  // reference every render → Zustand's useSyncExternalStore adapter compares
  // with Object.is, sees a snapshot change every time, and re-renders forever
  // (React surfaces this as "getSnapshot should be cached" +
  // "Cannot update a component while rendering").
  const users = usePresenceStore(useShallow((s) => Object.values(s.byId)));
  const selfId = useAuthStore((s) => s.user?.id ?? null);

  return (
    <div className="absolute inset-0 z-[6] pointer-events-none" aria-hidden>
      {users.map((u) => (
        <Pedestrian key={u.id} user={u} isSelf={u.id === selfId} />
      ))}
    </div>
  );
}
