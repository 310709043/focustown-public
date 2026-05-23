"use client";

import { useEffect, useState } from "react";
import type { StreetUser } from "@/lib/api/types.gen";
import { CHARACTERS, findCharacter, type CharacterDef } from "@/lib/data/characters";
import { hashUserId } from "@/lib/data/hash";
import type { StatusCode } from "@/lib/data/statuses";
import { useAuthStore } from "@/lib/state/authStore";
import { usePresenceByKind } from "@/lib/state/usePresenceByKind";

import { CitizenLabel } from "@/components/scene/CitizenLabel";
import { PngAnimatedSprite } from "@/components/pixel/PngAnimatedSprite";
import { PNG_WALKERS, WALKER_SCALE_DEFAULT } from "@/lib/pixel/sprites/walkersPng";

/**
 * Real online users walking the street. Each <Pedestrian> manages its
 * own jitter so adding & removing users from the parent list doesn't
 * thrash sibling timers. CSS animations (statusPop, userPop, selfHalo)
 * still carry the mount/focus feel.
 *
 * Phase 8.B (2026-05-20) — migrated the walking figure from the inline
 * 8×14 char-grid `WALKERS` (from `lib/pixel/sprites/world.ts`) to the
 * canonical 128×128 PNG sheets `PNG_WALKERS` (516149 City_men pack).
 * Each user maps to one of 3 City_men variants by a stable hash of
 * `user.id`; per-character color customisation is dropped (the PNG has
 * fixed T-shirt + trouser colors), but identity is preserved via the
 * 16×16 avatar head in `UserStatusPill` and the nameplate below the
 * walker (amber for self).
 */

const POSITIONS = [4, 13, 22, 32, 42, 52, 62, 72, 82, 91];

const pickPos = () => POSITIONS[Math.floor(Math.random() * POSITIONS.length)];

const fallbackCharacter = (userId: string): CharacterDef =>
  CHARACTERS[hashUserId(userId) % CHARACTERS.length];

// Stable per-user City_men variant index. The variant never changes
// for a given user.id, so list reorders from WS deltas don't reshuffle
// who's walking which sprite. Maps any string into [0, PNG_WALKERS.length).
const cityMenVariantFor = (userId: string): number =>
  hashUserId(userId) % PNG_WALKERS.length;

// Deterministic seed position based on user.id; same on SSR + CSR.
const seedPos = (userId: string): number =>
  POSITIONS[hashUserId(userId) % POSITIONS.length];

function Pedestrian({ user, isSelf }: { user: StreetUser; isSelf: boolean }) {
  // Initial position must be deterministic (SSR/CSR agreement). We
  // randomise via the interval below — that's client-only.
  const [x, setX] = useState<number>(() => seedPos(user.id));

  useEffect(() => {
    const id = setInterval(
      () => setX(pickPos()),
      (14 + Math.random() * 8) * 1000,
    );
    return () => clearInterval(id);
  }, []);

  const ch = findCharacter(user.character_key) ?? fallbackCharacter(user.id);
  const variant = PNG_WALKERS[cityMenVariantFor(user.id)];
  const walk = variant.walk;

  return (
    <div
      className="absolute animate-userPop ground-anchor"
      style={{
        left: `${x}%`,
        // People walk on the sidewalk strip of the Road band
        // (Road: bottom 168..288, sidewalk = top 30 px @ 258..288).
        // 258 anchors the figure's feet on the sidewalk so cars
        // driving on the asphalt below stay visually separated.
        // City-Mode immersive: shifts with the ground stack via --ground-shift.
        bottom: "calc(var(--ground-baseline) - var(--ground-shift, 0px))",
        transition:
          "left 18s cubic-bezier(0.4, 0, 0.2, 1), bottom 1100ms cubic-bezier(0.22, 1, 0.36, 1)",
      }}
    >
      {/* unified Name · Status · Activity pill — one pixel-pill per
          presence-driven entity. CitizenLabel handles self accent + the
          optional third dot-segment driven by user.activity. */}
      <div style={{ marginBottom: 2, textAlign: "center" }}>
        <CitizenLabel
          name={ch.name}
          statusCode={(user.status as StatusCode) || "focus"}
          activity={user.activity}
          isSelf={isSelf}
          size="md"
        />
      </div>

      {/* 516149 City_men walking PNG (10-frame loop @ 10 fps). Self
          carries a slow amber halo via the shared selfHalo keyframe;
          we apply it to the sprite wrapper so the glow surrounds the
          whole figure. Color identity per-character is preserved by
          the 16×16 avatar head in UserStatusPill + the nameplate
          above this sprite, not by the body sprite itself. */}
      <div
        className={isSelf ? "animate-selfHalo" : undefined}
        style={{ display: "inline-block" }}
        data-testid={`pedestrian-${user.id}`}
      >
        <PngAnimatedSprite
          url={walk.url}
          frameW={walk.frameW}
          frameH={walk.frameH}
          frames={walk.frames}
          fps={walk.fps}
          scale={WALKER_SCALE_DEFAULT}
          alt={ch.name}
        />
      </div>
    </div>
  );
}

export function Pedestrians() {
  // Only users whose entity assignment is "walker" appear here; cars / dogs /
  // birds are rendered by their respective components from the same store.
  const users = usePresenceByKind("walker");
  const selfId = useAuthStore((s) => s.user?.id ?? null);

  return (
    <div className="absolute inset-0 z-[6] pointer-events-none" aria-hidden>
      {users.map((u) => (
        <Pedestrian key={u.id} user={u} isSelf={u.id === selfId} />
      ))}
    </div>
  );
}
