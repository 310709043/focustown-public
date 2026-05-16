"use client";

import { RainOverlay } from "@/components/pixel/RainOverlay";
import { StarField } from "@/components/pixel/StarField";
import { useAuthStore } from "@/lib/state/authStore";
import { characterKeyToAvatar } from "@/lib/data/character-to-avatar";

import { BuddyHeaderCard } from "./BuddyHeaderCard";
import { BuddyTopBar } from "./BuddyTopBar";
import { RoomMusic } from "./RoomMusic";
import { SharedAgenda } from "./SharedAgenda";
import { SharedPanel } from "./SharedPanel";
import { SharedTimer } from "./SharedTimer";
import { StatusMini } from "./StatusMini";

interface BuddyFocusSceneProps {
  /** Match id — also used as the room code suffix. */
  matchId: string;
  /** Partner's `character_key` (resolved by the parent route). */
  partnerKey: string | null;
  /** Partner display name (best-effort, falls back to "Aria" seed). */
  partnerName?: string;
}

/**
 * Buddy focus room — reference port of `screen-buddy.jsx`.
 *
 * Layout: full-bleed purple-night gradient + StarField + ALWAYS-ON
 * pink RainOverlay (reference's signature buddy-room ambient) + 56 px
 * BuddyTopBar + 2-col body grid (1fr / 1.3fr).
 *
 * Left column stacks: BuddyHeaderCard → SharedTimer → StatusMini →
 * SharedAgenda → RoomMusic. Right column is the SharedPanel (chat/notes tabs).
 *
 * Reference: screen-buddy.jsx:L9-L150.
 */
export function BuddyFocusScene({
  matchId,
  partnerKey,
  partnerName = "Aria",
}: BuddyFocusSceneProps) {
  const user = useAuthStore((s) => s.user);
  const meAvatar = characterKeyToAvatar(user?.character_key);
  const buddyAvatar = characterKeyToAvatar(partnerKey ?? "kai");
  const meName = user?.display_name ?? "Yuki";

  return (
    <main
      data-testid="buddy-focus-scene"
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        background:
          "linear-gradient(180deg, #07041a 0%, #1a0d3d 60%, #2a1854 100%)",
      }}
    >
      {/* Stars — sparse density, full-bleed */}
      <div
        aria-hidden
        style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0 }}
      >
        <StarField density={0.0008} />
      </div>

      {/* Always-on rain — the buddy room's signature ambient.
          Reference renders RainOverlay unconditionally (not gated by
          weather), creating an intimate "two of us, raining outside" vibe. */}
      <RainOverlay color="rgba(167,139,250,0.4)" density={0.5} />

      {/* Top bar */}
      <div style={{ position: "relative", zIndex: 10 }}>
        <BuddyTopBar roomCode={matchId.slice(0, 6).toUpperCase()} />
      </div>

      {/* Body */}
      <div
        style={{
          position: "relative",
          zIndex: 2,
          display: "grid",
          gridTemplateColumns: "1fr 1.3fr",
          gap: 14,
          padding: 14,
          height: "calc(100% - 56px)",
          overflow: "hidden",
        }}
      >
        {/* LEFT column: header + shared timer + status + agenda + music */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            overflow: "auto",
            paddingRight: 4,
          }}
        >
          <BuddyHeaderCard
            meProfile={{ name: meName, avatar: meAvatar, level: 4 }}
            buddyProfile={{ name: partnerName, avatar: buddyAvatar, level: 6 }}
            sharedTag="#WRITING"
          />
          <SharedTimer matchId={matchId} />
          <StatusMini
            meProfile={{ name: meName, avatar: meAvatar, task: "寫 PRD" }}
            buddyProfile={{
              name: partnerName,
              avatar: buddyAvatar,
              task: "寫小說第七章",
            }}
          />
          <SharedAgenda />
          <RoomMusic />
        </div>

        {/* RIGHT column: shared panel (chat / notes tabs) */}
        <SharedPanel
          matchId={matchId}
          meAvatar={meAvatar}
          buddyAvatar={buddyAvatar}
          meName={meName}
          buddyName={partnerName}
        />
      </div>
    </main>
  );
}
