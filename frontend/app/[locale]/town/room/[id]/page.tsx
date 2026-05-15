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
      <main className="absolute inset-0 grid place-items-center bg-bg text-muted font-japan">
        <span>{tRoom("openingDoor")}</span>
      </main>
    );
  }

  // ── Owner / read-only render ─────────────────────────────────────────────

  return (
    <main className="absolute inset-0 flex flex-col overflow-hidden bg-bg">
      <nav
        className="bg-[rgba(2,0,12,0.97)] border-b border-border flex items-center justify-between px-3 md:px-5 z-20 gap-2"
        style={{ height: 56 }}
      >
        <Link
          href="/town"
          className="font-japan text-muted hover:text-amber active:text-amber transition-colors flex items-center gap-2 touch:py-2 touch:-my-2 shrink-0"
          style={{ fontSize: 13 }}
        >
          <span style={{ fontSize: 15 }}>◂</span> {tRoom("backToStreet")}
        </Link>
        <div className="flex items-center gap-3">
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
              className="bg-transparent text-amber font-japan outline-none px-2 py-1"
              style={{
                fontSize: 14,
                borderBottom: "2px dashed var(--amber)",
                caretColor: "var(--amber)",
                minWidth: 180,
                textAlign: "center",
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => isOwner && setEditing(true)}
              className="font-japan"
              style={{
                fontSize: 14,
                color: "var(--a2)",
                cursor: isOwner ? "text" : "default",
                letterSpacing: 1,
                textShadow: "0 0 10px rgba(196,181,253,0.35)",
              }}
              title={isOwner ? tRoom("renameTooltip") : ""}
            >
              {room.name}
            </button>
          )}
        </div>
        <span
          className="font-mono text-muted"
          style={{ fontSize: 11, letterSpacing: 1.2 }}
        >
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
            className="absolute z-10 flex items-center gap-1.5 px-3 py-2 rounded-md flex-wrap right-3 bottom-3 md:right-4 md:bottom-[148px] max-w-[calc(100%-1.5rem)]"
            style={{
              background: "rgba(8,3,25,0.85)",
              border: "1px solid var(--border2)",
              boxShadow: "0 0 14px rgba(167,139,250,0.18)",
              backdropFilter: "blur(6px)",
            }}
          >
            <span
              className="font-mono text-muted"
              style={{ fontSize: 11, letterSpacing: 1, marginRight: 4 }}
            >
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
                  className="font-japan transition-transform touch:w-9 touch:h-9 touch:text-[15px]"
                  style={{
                    width: 26,
                    height: 26,
                    fontSize: 13,
                    lineHeight: "24px",
                    border: active ? "1px solid var(--amber)" : "1px solid var(--border)",
                    background: active
                      ? "linear-gradient(180deg, rgba(252,211,77,0.22), rgba(252,211,77,0.08))"
                      : "rgba(18,8,48,0.6)",
                    color: active ? "var(--amber)" : "var(--muted)",
                    boxShadow: active
                      ? "inset 0 1px 4px rgba(252,211,77,0.4), 0 0 6px rgba(252,211,77,0.2)"
                      : "inset 0 0 4px rgba(0,0,0,0.4)",
                    imageRendering: "pixelated",
                    transform: active ? "translateY(1px)" : "none",
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
