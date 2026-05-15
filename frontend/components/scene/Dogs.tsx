"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { StreetUser } from "@/lib/api/types.gen";
import { CHARACTERS, findCharacter, type CharacterDef } from "@/lib/data/characters";
import { hashUserId } from "@/lib/data/hash";
import { statusByCode, type StatusCode } from "@/lib/data/statuses";
import { useAuthStore } from "@/lib/state/authStore";
import { usePresenceByKind } from "@/lib/state/usePresenceByKind";

import { AnimatedSprite } from "@/components/pixel/AnimatedSprite";
import { DOG_WALK } from "@/lib/pixel/sprites/world";

/**
 * Users whose `entityKindFor(user.id) === "dog"` show up here as wandering
 * dogs on the sidewalk. Same animation pattern as `Pedestrians`, just a
 * slower reposition cadence so dogs read as curious sniffers, not joggers.
 */

const POSITIONS = [6, 16, 26, 38, 48, 58, 70, 80, 90];

const pickPos = () => POSITIONS[Math.floor(Math.random() * POSITIONS.length)];

const fallbackCharacter = (userId: string): CharacterDef =>
  CHARACTERS[hashUserId(userId) % CHARACTERS.length];

const seedPos = (userId: string): number =>
  POSITIONS[hashUserId(userId) % POSITIONS.length];

function Dog({ user, isSelf }: { user: StreetUser; isSelf: boolean }) {
  const [x, setX] = useState<number>(() => seedPos(user.id));
  const t = useTranslations("town.scene");

  useEffect(() => {
    const id = setInterval(
      () => setX(pickPos()),
      (10 + Math.random() * 6) * 1000,
    );
    return () => clearInterval(id);
  }, []);

  const ch = findCharacter(user.character_key) ?? fallbackCharacter(user.id);
  const status = statusByCode((user.status as StatusCode) || "afk");

  return (
    <div
      className="absolute animate-userPop"
      style={{
        left: `${x}%`,
        bottom: 100,
        transition: "left 11s cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    >
      {/* status bubble */}
      <div
        key={status.code}
        className="animate-statusPop font-japan"
        style={{
          position: "absolute",
          bottom: 40,
          left: "50%",
          transform: "translateX(-50%)",
          background: "rgba(3,1,17,0.94)",
          border: `1px solid ${status.color}`,
          color: status.color,
          fontSize: 10,
          padding: "2px 6px",
          borderRadius: 99,
          whiteSpace: "nowrap",
          boxShadow: `0 0 10px ${status.color}55, inset 0 0 4px ${status.color}33`,
          letterSpacing: 0.5,
        }}
      >
        {status.emoji} {status.label}
      </div>

      {/* name plate — 🐕 prefix instead of the character emoji so the
          owner of a dog is unambiguous at a glance */}
      <div
        className="font-japan"
        style={{
          fontSize: 10,
          color: isSelf ? "var(--amber)" : "var(--a2)",
          textAlign: "center",
          textShadow: isSelf
            ? "0 0 6px var(--amber), 0 0 12px rgba(252,211,77,0.55)"
            : "0 0 6px var(--a3), 0 0 10px var(--a1)",
          background: isSelf
            ? "rgba(252,211,77,0.10)"
            : "rgba(3,1,17,0.55)",
          padding: "1px 5px",
          borderRadius: 4,
          marginBottom: 2,
          whiteSpace: "nowrap",
          border: isSelf
            ? "1px solid rgba(252,211,77,0.45)"
            : "1px solid rgba(167,139,250,0.25)",
          letterSpacing: 0.5,
        }}
      >
        🐕 {isSelf ? `${ch.name} ・ ${t("youSuffix")}` : ch.name}
      </div>

      <div className={isSelf ? "animate-selfHalo" : undefined} style={{ display: "inline-block" }}>
        <AnimatedSprite
          frames={DOG_WALK.frames}
          palette={DOG_WALK.palette}
          fps={3}
          scale={3}
        />
      </div>
    </div>
  );
}

export function Dogs() {
  const users = usePresenceByKind("dog");
  const selfId = useAuthStore((s) => s.user?.id ?? null);

  return (
    <div className="absolute inset-0 z-[6] pointer-events-none" aria-hidden>
      {users.map((u) => (
        <Dog key={u.id} user={u} isSelf={u.id === selfId} />
      ))}
    </div>
  );
}
