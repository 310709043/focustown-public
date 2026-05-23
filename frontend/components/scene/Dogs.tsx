"use client";

import { useEffect, useState } from "react";
import type { StreetUser } from "@/lib/api/types.gen";
import { CHARACTERS, findCharacter, type CharacterDef } from "@/lib/data/characters";
import { hashUserId } from "@/lib/data/hash";
import type { StatusCode } from "@/lib/data/statuses";
import { useAuthStore } from "@/lib/state/authStore";
import { usePresenceByKind } from "@/lib/state/usePresenceByKind";

import { AnimatedSprite } from "@/components/pixel/AnimatedSprite";
import { CitizenLabel } from "@/components/scene/CitizenLabel";
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

  useEffect(() => {
    const id = setInterval(
      () => setX(pickPos()),
      (16 + Math.random() * 8) * 1000,
    );
    return () => clearInterval(id);
  }, []);

  const ch = findCharacter(user.character_key) ?? fallbackCharacter(user.id);

  return (
    <div
      className="absolute animate-userPop ground-anchor"
      style={{
        left: `${x}%`,
        // 2026-05-21: aligned with new Road sidewalk strip
        // (Road: bottom 168..288; sidewalk @ 258..288).
        // City-Mode immersive: shifts with the ground stack via --ground-shift.
        bottom: "calc(var(--ground-baseline) - var(--ground-shift, 0px))",
        transition:
          "left 20s cubic-bezier(0.4, 0, 0.2, 1), bottom 1100ms cubic-bezier(0.22, 1, 0.36, 1)",
      }}
    >
      {/* 🐕 prefix marks the owner of the dog unambiguously even though
          the sprite itself is the dog, not the human. */}
      <div style={{ marginBottom: 2, textAlign: "center" }}>
        <CitizenLabel
          name={ch.name}
          statusCode={(user.status as StatusCode) || "afk"}
          activity={user.activity}
          isSelf={isSelf}
          size="sm"
          prefix="🐕"
        />
      </div>

      <div className={isSelf ? "animate-selfHalo" : undefined} style={{ display: "inline-block" }}>
        <AnimatedSprite
          frames={DOG_WALK.frames}
          palette={DOG_WALK.palette}
          fps={3}
          scale={2}
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
