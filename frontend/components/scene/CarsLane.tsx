"use client";

import { useMemo } from "react";
import type { StreetUser } from "@/lib/api/types.gen";
import { CHARACTERS, findCharacter, type CharacterDef } from "@/lib/data/characters";
import { useAuthStore } from "@/lib/state/authStore";
import { usePresenceStore } from "@/lib/state/presenceStore";

/**
 * One car per online user, driving across the road in a continuous loop.
 * Each user appears here in tandem with their <Pedestrian> entry — Phase 3
 * will split the two when the user equips a vehicle / avatar separately.
 *
 * Drive duration + offset are derived deterministically from user.id so a
 * given user's car always feels "theirs" and doesn't reshuffle every render.
 */

const fallbackCharacter = (userId: string): CharacterDef => {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) | 0;
  }
  return CHARACTERS[Math.abs(hash) % CHARACTERS.length];
};

const hashCode = (s: string): number => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
};

function Car({
  user,
  isSelf,
  laneIndex,
}: {
  user: StreetUser;
  isSelf: boolean;
  laneIndex: number;
}) {
  const ch = findCharacter(user.character_key) ?? fallbackCharacter(user.id);
  // Stable per-user motion params so reflows from list reorders don't reset.
  const params = useMemo(() => {
    const h = Math.abs(hashCode(user.id));
    const dur = 4.4 + (h % 28) / 10; // 4.4 .. 7.2 seconds (matches original feel)
    const delay = -((h % 100) / 100) * dur;
    return { dur, delay };
  }, [user.id]);

  return (
    <div
      className="absolute animate-carDrive"
      style={
        {
          bottom: 2 + (laneIndex % 2) * 18,
          left: 0,
          ["--car-dur" as string]: `${params.dur}s`,
          ["--car-delay" as string]: `${params.delay}s`,
        } as React.CSSProperties
      }
    >
      {/* name plate — self in amber */}
      <div
        style={{
          position: "absolute",
          bottom: 24,
          left: "50%",
          transform: "translateX(-50%)",
          background: "rgba(3,1,17,0.85)",
          border: `1px solid ${isSelf ? "var(--amber)" : ch.bodyColor}`,
          padding: "0 4px",
          fontSize: 7,
          color: isSelf ? "var(--amber)" : "var(--a2)",
          borderRadius: 2,
          whiteSpace: "nowrap",
          textShadow: isSelf
            ? "0 0 4px var(--amber), 0 0 8px rgba(252,211,77,0.6)"
            : "0 0 3px var(--a1)",
        }}
      >
        {ch.emoji} {isSelf ? `${ch.name} ・ 你` : ch.name}
      </div>

      {/* car body — pixel composition (self car gets amber underglow) */}
      <div
        className={`pixel-edge ${isSelf ? "animate-selfHalo" : ""}`}
        style={{ width: 40, position: "relative" }}
      >
        <div
          style={{
            height: 9,
            borderRadius: "3px 3px 0 0",
            margin: "0 5px",
            background: ch.roofColor,
          }}
        />
        <div
          style={{
            height: 13,
            borderRadius: 2,
            background: ch.bodyColor,
            position: "relative",
          }}
        >
          {/* windows */}
          <div
            style={{
              position: "absolute",
              top: 2,
              left: 5,
              width: 10,
              height: 8,
              borderRadius: 1,
              background: "rgba(147,197,253,0.55)",
            }}
          />
          <div
            style={{
              position: "absolute",
              top: 2,
              left: 21,
              width: 10,
              height: 8,
              borderRadius: 1,
              background: "rgba(147,197,253,0.55)",
            }}
          />
          {/* headlight */}
          <div
            style={{
              position: "absolute",
              right: -2,
              top: 4,
              width: 3,
              height: 5,
              background: "#fed7aa",
              borderRadius: 1,
              boxShadow: "0 0 8px #fed7aacc",
            }}
          />
          {/* taillight */}
          <div
            style={{
              position: "absolute",
              left: -2,
              top: 4,
              width: 3,
              height: 5,
              background: "#fca5a5",
              borderRadius: 1,
              boxShadow: "0 0 4px #fca5a566",
            }}
          />
        </div>
        <div className="flex justify-between px-1 mt-px">
          <div
            style={{
              width: 10,
              height: 6,
              background: "#111",
              border: "1px solid #333",
              borderRadius: 2,
            }}
          />
          <div
            style={{
              width: 10,
              height: 6,
              background: "#111",
              border: "1px solid #333",
              borderRadius: 2,
            }}
          />
        </div>
        {/* taillight glow trail */}
        <div
          style={{
            position: "absolute",
            left: -6,
            top: "50%",
            width: 14,
            height: 5,
            background:
              "radial-gradient(ellipse, rgba(252,165,165,0.55), transparent 70%)",
            transform: "translateY(-50%)",
            borderRadius: "50%",
            filter: "blur(2px)",
          }}
        />
      </div>
    </div>
  );
}

export function CarsLane() {
  const users = usePresenceStore((s) => Object.values(s.byId));
  const selfId = useAuthStore((s) => s.user?.id ?? null);

  return (
    <div
      className="absolute left-0 right-0 pointer-events-none z-[5]"
      style={{ bottom: 57, height: 56 }}
      aria-hidden
    >
      {users.map((u, idx) => (
        <Car key={u.id} user={u} isSelf={u.id === selfId} laneIndex={idx} />
      ))}
    </div>
  );
}
