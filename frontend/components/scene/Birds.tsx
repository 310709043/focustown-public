"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import type { StreetUser } from "@/lib/api/types.gen";
import { CHARACTERS, findCharacter, type CharacterDef } from "@/lib/data/characters";
import { hashUserId } from "@/lib/data/hash";
import { statusByCode, type StatusCode } from "@/lib/data/statuses";
import { useAuthStore } from "@/lib/state/authStore";
import { usePresenceByKind } from "@/lib/state/usePresenceByKind";

import { AnimatedSprite } from "@/components/pixel/AnimatedSprite";
import { BIRD_FLY } from "@/lib/pixel/sprites/world";

/**
 * Users whose `entityKindFor(user.id) === "bird"` fly across the sky band
 * in a continuous loop, similar to <Airplane> but smaller and lower.
 * Each bird's traversal duration + vertical offset is deterministic per
 * user.id so their flight path is consistent across reconnects.
 */

const fallbackCharacter = (userId: string): CharacterDef =>
  CHARACTERS[hashUserId(userId) % CHARACTERS.length];

function Bird({ user, isSelf }: { user: StreetUser; isSelf: boolean }) {
  const t = useTranslations("town.scene");
  const ch = findCharacter(user.character_key) ?? fallbackCharacter(user.id);
  const status = statusByCode((user.status as StatusCode) || "afk");

  const params = useMemo(() => {
    const h = hashUserId(user.id);
    const dur = 22 + (h % 80) / 10; // 22 .. 30 seconds
    const delay = -((h % 100) / 100) * dur;
    // Sky band: top 18% .. 30% — under airplanes (which top out ~32-40%),
    // above the skyline (Buildings).
    const top = 18 + (h % 12);
    return { dur, delay, top };
  }, [user.id]);

  return (
    <div
      className="absolute pointer-events-none animate-airplane"
      style={
        {
          top: `${params.top}%`,
          left: 0,
          ["--ap-dur" as string]: `${params.dur}s`,
          ["--ap-delay" as string]: `${params.delay}s`,
        } as React.CSSProperties
      }
    >
      {/* tiny name plate — birds are small so the bubble must be smaller */}
      <div
        key={status.code}
        className="font-japan"
        style={{
          position: "absolute",
          bottom: 20,
          left: "50%",
          transform: "translateX(-50%)",
          background: "rgba(3,1,17,0.7)",
          border: `1px solid ${isSelf ? "var(--amber)" : status.color}`,
          color: isSelf ? "var(--amber)" : status.color,
          fontSize: 8,
          padding: "1px 4px",
          borderRadius: 3,
          whiteSpace: "nowrap",
          letterSpacing: 0.4,
        }}
      >
        🐦 {isSelf ? `${ch.name} ・ ${t("youSuffix")}` : ch.name}
      </div>

      <div className={isSelf ? "animate-selfHalo" : undefined} style={{ display: "inline-block" }}>
        <AnimatedSprite
          frames={BIRD_FLY.frames}
          palette={BIRD_FLY.palette}
          fps={6}
          scale={2}
        />
      </div>
    </div>
  );
}

export function Birds() {
  const users = usePresenceByKind("bird");
  const selfId = useAuthStore((s) => s.user?.id ?? null);

  return (
    <div className="absolute inset-0 z-[5] pointer-events-none" aria-hidden>
      {users.map((u) => (
        <Bird key={u.id} user={u} isSelf={u.id === selfId} />
      ))}
    </div>
  );
}
