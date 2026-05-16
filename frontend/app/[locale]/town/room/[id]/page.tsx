"use client";

/**
 * Phase 4 — `/town/room/[id]`. Single-occupant pixel interior.
 *
 * Aesthetic: 8-bit-style "indoor" composition. We deliberately do NOT
 * reuse the street's Sky/Buildings stack — those say "outdoors" too
 * strongly. Instead the wall is a vertical scene gradient, the floor a
 * scanline pattern, and the bedrock element is an engraved nameplate
 * on the back wall (the one thing visitors will remember in Phase 8).
 *
 * Wave 1 (this stint) factored the six interior sub-components out to
 * `@/components/town/room/*` and reserved three slot markers for the
 * later waves to mount their features into.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { Link, useRouter } from "@/i18n/routing";
import { ApiError } from "@/lib/api/client";
import { roomApi } from "@/lib/api/endpoints";
import type { Room, RoomTheme } from "@/lib/api/types.gen";
import { findCharacter } from "@/lib/data/characters";
import { SCENES } from "@/lib/data/scenes";
import { useAuthStore } from "@/lib/state/authStore";

import { Wall } from "@/components/town/room/Wall";
import { OutsideWindow } from "@/components/town/room/OutsideWindow";
import { OwnerPlaque } from "@/components/town/room/OwnerPlaque";
import { Floor } from "@/components/town/room/Floor";
import { LockedRoom } from "@/components/town/room/LockedRoom";
import { MissingRoom } from "@/components/town/room/MissingRoom";
import { DecorationCanvas } from "@/components/town/room/DecorationCanvas";
import { VisitorPanel } from "@/components/town/room/VisitorPanel";
import { PersonalRadio } from "@/components/audio/PersonalRadio";
import { BlinkDot } from "@/components/pixel/BlinkDot";

const THEME_KEYS: Array<{ key: RoomTheme; chip: string }> = [
  { key: "dawn", chip: "🌅" },
  { key: "day", chip: "☀️" },
  { key: "dusk", chip: "🌇" },
  { key: "night", chip: "🌙" },
  { key: "rain", chip: "🌧" },
  { key: "snow", chip: "❄️" },
  { key: "storm", chip: "⛈" },
];

export default function RoomPage() {
  const params = useParams<{ id: string }>();
  const roomId = String(params?.id ?? "");
  const router = useRouter();
  const { user, hydrate } = useAuthStore();
  const tRoom = useTranslations("town.room");
  const tThemes = useTranslations("town.room.themes");

  // Router pre-fetch noop kept for parity with previous file; useRouter not
  // strictly needed yet but reserved for future programmatic nav from here.
  void router;

  const [room, setRoom] = useState<Room | null>(null);
  const [error, setError] = useState<"forbidden" | "not_found" | "load_failed" | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [themeKey, setThemeKey] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) void hydrate();
  }, [user, hydrate]);

  useEffect(() => {
    if (!roomId) return;
    let cancelled = false;
    (async () => {
      try {
        const fresh = await roomApi.getById(roomId);
        if (!cancelled) {
          setRoom(fresh);
          setNameDraft(fresh.name);
        }
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 403) setError("forbidden");
        else if (e instanceof ApiError && e.status === 404) setError("not_found");
        else setError("load_failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [roomId]);

  const isOwner = !!(room && user && room.owner_user_id === user.id);
  const character = useMemo(
    () => findCharacter(user?.character_key),
    [user?.character_key],
  );

  const scene = SCENES[room?.theme ?? "night"];

  async function commitName() {
    if (!room) return;
    const next = nameDraft.trim();
    if (!next || next === room.name || next.length > 64) {
      setNameDraft(room.name);
      setEditing(false);
      return;
    }
    setBusy(true);
    try {
      const fresh = await roomApi.updateMine({ name: next });
      setRoom(fresh);
      setNameDraft(fresh.name);
    } catch {
      setNameDraft(room.name);
    } finally {
      setBusy(false);
      setEditing(false);
    }
  }

  async function switchTheme(t: RoomTheme) {
    if (!room || room.theme === t || busy) return;
    const previous = room;
    setBusy(true);
    setRoom({ ...room, theme: t });
    setThemeKey((k) => k + 1);
    try {
      const fresh = await roomApi.updateMine({ theme: t });
      setRoom(fresh);
    } catch {
      setRoom(previous);
    } finally {
      setBusy(false);
    }
  }

  // ── Error states ────────────────────────────────────────────────────────

  if (error === "forbidden") {
    return <LockedRoom roomId={roomId} />;
  }
  if (error === "not_found") {
    return <MissingRoom />;
  }
  if (error === "load_failed" || !room) {
    return (
      <main className="absolute inset-0 grid place-items-center bg-bg">
        <div
          className="pixel-panel font-silkscreen"
          style={{
            padding: "12px 18px",
            fontSize: 10,
            color: "var(--ink-mute)",
            letterSpacing: "0.15em",
          }}
        >
          {tRoom("openingDoor")}
        </div>
      </main>
    );
  }

  // ── Owner / read-only render ─────────────────────────────────────────────

  return (
    <main className="absolute inset-0 flex flex-col overflow-hidden bg-bg">
      <nav
        className="flex items-center justify-between px-3 md:px-5 z-20"
        style={{
          height: 56,
          gap: 8,
          background: "var(--card)",
          borderBottom: "1px solid var(--panel-stroke)",
        }}
      >
        <Link
          href="/town"
          className="font-silkscreen transition-colors flex items-center shrink-0 touch:py-2 touch:-my-2"
          style={{
            fontSize: 10,
            color: "var(--ink-mute)",
            letterSpacing: "0.15em",
            gap: 6,
          }}
        >
          ◀ {tRoom("backToStreet")}
        </Link>
        <div className="flex items-center" style={{ gap: 12 }}>
          {editing && isOwner ? (
            <input
              ref={inputRef}
              autoFocus
              value={nameDraft}
              maxLength={64}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitName();
                if (e.key === "Escape") {
                  setNameDraft(room.name);
                  setEditing(false);
                }
              }}
              className="pixel-input font-silkscreen"
              style={{
                fontSize: 12,
                padding: "4px 10px",
                minWidth: 200,
                width: "auto",
                textAlign: "center",
                letterSpacing: "0.1em",
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => isOwner && setEditing(true)}
              className="font-silkscreen"
              style={{
                fontSize: 12,
                color: "var(--accent)",
                cursor: isOwner ? "text" : "default",
                letterSpacing: "0.15em",
                textShadow: "0 0 8px var(--accent)",
                background: "transparent",
                border: "none",
                padding: 0,
              }}
              title={isOwner ? tRoom("renameTooltip") : ""}
            >
              {room.name}
            </button>
          )}
        </div>
        <span
          className="font-silkscreen"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 9,
            color: "var(--ink-dim)",
            letterSpacing: "0.2em",
          }}
        >
          <BlinkDot color="var(--accent-3)" />
          {isOwner ? tRoom("ownerBadge") : tRoom("visitorBadge")}
        </span>
      </nav>

      <div className="relative flex-1 overflow-hidden animate-roomShutterOpen">
        <Wall key={themeKey} sky={scene.sky} label={scene.label} />
        <OutsideWindow />
        <OwnerPlaque
          emoji={character?.emoji ?? "👤"}
          name={character?.name ?? user?.display_name ?? "—"}
          role={user?.role_label ?? null}
        />
        <Floor />

        <DecorationCanvas isOwner={isOwner} roomId={roomId} />
        <VisitorPanel
          roomId={roomId}
          ownerUserId={room.owner_user_id}
          currentUserId={user?.id ?? null}
        />
        {/* Each visitor hears their own randomized shuffle of the
            official catalog — deliberately NOT synchronized to the
            owner's playback. Phase 9's room_playback table stays in
            place server-side but is no longer wired to the UI.
            Position mirrors /town and /focus: bottom-right, 16px from
            each edge, 244px wide. */}
        <div
          className="absolute z-10 hidden md:block"
          style={{ right: 16, bottom: 16, width: 244 }}
        >
          <PersonalRadio context="room" contextId={roomId} label="房間音樂" />
        </div>

        {isOwner && (
          <div
            className="pixel-panel absolute z-10 flex items-center flex-wrap right-3 bottom-3 md:right-4 md:bottom-[148px] max-w-[calc(100%-1.5rem)]"
            style={{
              padding: "8px 10px",
              gap: 8,
            }}
          >
            <span
              className="font-silkscreen"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 9,
                color: "var(--ink-dim)",
                letterSpacing: "0.2em",
                marginRight: 2,
              }}
            >
              <BlinkDot color="var(--amber)" />
              {tRoom("themePickerLabel")}
            </span>
            {THEME_KEYS.map((th) => {
              const active = th.key === room.theme;
              return (
                <button
                  key={th.key}
                  type="button"
                  disabled={busy}
                  onClick={() => switchTheme(th.key)}
                  title={tThemes(th.key)}
                  className={`pixel-btn touch:w-10 touch:h-10 touch:text-[18px]${active ? " primary" : ""}`}
                  style={{
                    width: 34,
                    height: 34,
                    padding: 0,
                    fontSize: 16,
                    lineHeight: 1,
                    cursor: busy ? "wait" : "pointer",
                  }}
                >
                  {th.chip}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
