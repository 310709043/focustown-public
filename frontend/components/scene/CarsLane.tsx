"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import type { StreetUser } from "@/lib/api/types.gen";
import { CHARACTERS, findCharacter, type CharacterDef } from "@/lib/data/characters";
import { hashUserId } from "@/lib/data/hash";
import { useAuthStore } from "@/lib/state/authStore";
import { usePresenceByKind } from "@/lib/state/usePresenceByKind";

import { AnimatedSprite } from "@/components/pixel/AnimatedSprite";
import { buildCar } from "@/lib/pixel/sprites/world";

/**
 * One car per online user, driving across the road in a continuous loop.
 *
 * Tier 4b: the car body is now a pixel `<AnimatedSprite>` from
 * `buildCar(bodyColor, windowColor)` in `lib/pixel/sprites/world.ts`.
 * The vehicle-equipment swap path still works — `user.vehicle.body_color`
 * overrides the character default, just as the previous CSS implementation
 * did, so equipping a vehicle in /shop flips the on-screen car color via
 * the presence WebSocket without a page reload.
 *
 * Drive duration + offset remain derived deterministically from `user.id`
 * so a given user's car always feels "theirs" and doesn't reshuffle on
 * every render.
 */

const fallbackCharacter = (userId: string): CharacterDef =>
  CHARACTERS[hashUserId(userId) % CHARACTERS.length];

function Car({
  user,
  isSelf,
  laneIndex,
}: {
  user: StreetUser;
  isSelf: boolean;
  laneIndex: number;
}) {
  const t = useTranslations("town.scene");
  const ch = findCharacter(user.character_key) ?? fallbackCharacter(user.id);
  // If the user has an equipped vehicle, prefer its body/window colors over
  // the character defaults. The driver's *name* still uses the character
  // identity — the car visually changes, the person behind the wheel doesn't.
  const v = user.vehicle;
  const bodyColor = v?.body_color ?? ch.bodyColor;
  const windowColor = v?.roof_color ?? "#a78bfa";
  const plateEmoji = v?.icon ?? ch.emoji;

  // Stable per-user motion params so reflows from list reorders don't reset.
  const params = useMemo(() => {
    const h = hashUserId(user.id);
    const dur = 14 + (h % 80) / 10; // 14 .. 22 seconds — calmer afternoon pace
    const delay = -((h % 100) / 100) * dur;
    return { dur, delay };
  }, [user.id]);

  // Re-build the car sprite only when the body/window colors actually change.
  // The sprite engine LRU caches by `sprite+palette` so repeated mounts with
  // the same equipment cost zero canvas draws after the first.
  const car = useMemo(() => buildCar(bodyColor, windowColor), [bodyColor, windowColor]);

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
          bottom: 36,
          left: "50%",
          transform: "translateX(-50%)",
          background: "rgba(3,1,17,0.85)",
          border: `1px solid ${isSelf ? "var(--amber)" : bodyColor}`,
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
        {plateEmoji} {isSelf ? `${ch.name} ・ ${t("youSuffix")}` : ch.name}
      </div>

      {/* pixel car body. The drop-shadow filter gives the neon-glow trail
          that the old CSS taillight-blur effect provided, but tied to the
          live body color so vehicle equips shift the glow too. */}
      <div
        className={isSelf ? "animate-selfHalo" : undefined}
        style={{
          filter: `drop-shadow(0 0 6px ${bodyColor}) drop-shadow(0 0 12px ${bodyColor}55)`,
        }}
      >
        <AnimatedSprite
          frames={car.frames}
          palette={car.palette}
          fps={5}
          scale={2}
        />
      </div>
    </div>
  );
}

export function CarsLane() {
  // Only users whose entity assignment is "car" appear here.
  const users = usePresenceByKind("car");
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
