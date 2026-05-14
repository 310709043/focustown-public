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
 * Phase 5 will mount decorations on `<Wall>` and `<Floor>`; for now we
 * keep this whole page inline so the components don't get promoted
 * before they have real reuse.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import { ApiError } from "@/lib/api/client";
import { roomApi } from "@/lib/api/endpoints";
import type { Room, RoomTheme } from "@/lib/api/types.gen";
import { findCharacter } from "@/lib/data/characters";
import { SCENES } from "@/lib/data/scenes";
import { useAuthStore } from "@/lib/state/authStore";

const THEMES: { key: RoomTheme; label: string; chip: string }[] = [
  { key: "dawn", label: "黎明",   chip: "🌅" },
  { key: "day", label: "白天",    chip: "☀️" },
  { key: "dusk", label: "黃昏",   chip: "🌇" },
  { key: "night", label: "夜晚",  chip: "🌙" },
  { key: "rain", label: "雨夜",   chip: "🌧" },
  { key: "snow", label: "雪夜",   chip: "❄️" },
  { key: "storm", label: "暴風雨", chip: "⛈" },
];

export default function RoomPage() {
  const params = useParams<{ id: string }>();
  const roomId = String(params?.id ?? "");
  const router = useRouter();
  const { user, hydrate } = useAuthStore();

  const [room, setRoom] = useState<Room | null>(null);
  const [error, setError] = useState<"forbidden" | "not_found" | "load_failed" | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  // A token bumped on every successful theme switch so the wallpaper
  // layer remounts with the cross-fade animation rather than swapping
  // colors instantaneously.
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
        <span>正在開門…</span>
      </main>
    );
  }

  // ── Owner / read-only render ─────────────────────────────────────────────

  return (
    <main className="absolute inset-0 flex flex-col overflow-hidden bg-bg">
      <nav
        className="bg-[rgba(2,0,12,0.97)] border-b border-border flex items-center justify-between px-5 z-20"
        style={{ height: 56 }}
      >
        <Link
          href="/town"
          className="font-japan text-muted hover:text-amber transition-colors flex items-center gap-2"
          style={{ fontSize: 13 }}
        >
          <span style={{ fontSize: 15 }}>◂</span> 回街景
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
              title={isOwner ? "點擊重新命名" : ""}
            >
              {room.name}
            </button>
          )}
        </div>
        <span
          className="font-mono text-muted"
          style={{ fontSize: 11, letterSpacing: 1.2 }}
        >
          {isOwner ? "OWNER" : "VISITOR"}
        </span>
      </nav>

      {/* The whole interior animates open once on mount — feels like a
          door being shoved aside rather than a quiet fade. */}
      <div className="relative flex-1 overflow-hidden animate-roomShutterOpen">
        <Wall key={themeKey} sky={scene.sky} label={scene.label} />
        <OutsideWindow />
        <OwnerPlaque
          emoji={character?.emoji ?? "👤"}
          name={character?.name ?? user?.display_name ?? "—"}
          role={user?.role_label ?? null}
        />
        <Floor />

        {/* Theme toolbar — bottom-right, owner-only. The active chip is
            inset (pressed) so the user can see which theme is current
            without reading text. */}
        {isOwner && (
          <div
            className="absolute z-10 flex items-center gap-1.5 px-3 py-2 rounded-md"
            style={{
              right: 24,
              bottom: 24,
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
              主題
            </span>
            {THEMES.map((t) => {
              const active = t.key === room.theme;
              return (
                <button
                  key={t.key}
                  type="button"
                  disabled={busy}
                  onClick={() => switchTheme(t.key)}
                  title={t.label}
                  className="font-japan transition-transform"
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
                  {t.chip}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}

// ── Sub-components (inline; promoted to /components/room in Phase 5) ────────

function Wall({ sky, label }: { sky: string; label: string }) {
  return (
    <div
      className="absolute inset-0 animate-themeCrossfade"
      style={{
        background: sky,
        // 48-pixel wallpaper pinstripe — barely there, but it breaks the
        // flat gradient so the wall feels like a surface, not a void.
        backgroundImage: `${sky}, repeating-linear-gradient(90deg, transparent 0 47px, rgba(167,139,250,0.05) 47px 48px)`,
        backgroundBlendMode: "normal",
      }}
    >
      {/* Top label — same family as the street's WeatherBadge so the
          worlds feel cohesive, but framed as a wall plaque. */}
      <div
        className="absolute font-mono"
        style={{
          top: 16,
          left: 24,
          fontSize: 12,
          color: "var(--muted)",
          letterSpacing: 1.5,
          padding: "4px 8px",
          border: "1px solid var(--border)",
          background: "rgba(8,3,25,0.55)",
        }}
      >
        {label}
      </div>
    </div>
  );
}

function OutsideWindow() {
  // A small 80×60 pixel window high on the right wall. The interior
  // (next-door scene gradient + a single twinkling star) reads as the
  // street weather seen from inside.
  return (
    <div
      className="absolute"
      style={{
        right: "12%",
        top: "14%",
        width: 96,
        height: 72,
        border: "2px solid var(--a3)",
        background: "linear-gradient(180deg, #04020e 0%, #0a0420 100%)",
        boxShadow:
          "0 0 14px rgba(167,139,250,0.25), inset 0 0 18px rgba(167,139,250,0.15)",
        imageRendering: "pixelated",
      }}
    >
      {/* Mullion cross — pixel-art window pane divider. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(90deg, transparent 47%, var(--a3) 47% 53%, transparent 53%), linear-gradient(0deg, transparent 47%, var(--a3) 47% 53%, transparent 53%)",
          pointerEvents: "none",
        }}
      />
      {/* A single twinkling star — same `tw` animation the night sky
          uses, so the window feels connected to the street outside. */}
      <div
        className="animate-twinkle"
        style={{
          position: "absolute",
          top: 16,
          left: 18,
          width: 3,
          height: 3,
          background: "var(--a2)",
          boxShadow: "0 0 4px var(--a1), 0 0 10px var(--a3)",
        }}
      />
    </div>
  );
}

function OwnerPlaque({
  emoji,
  name,
  role,
}: {
  emoji: string;
  name: string;
  role: string | null;
}) {
  // Engraved brass nameplate on the back wall — Press Start 2P for the
  // name (display), VT323 for the role caption. Box-shadow stacks four
  // layers to fake the brass + engraved-into-wood look.
  return (
    <div
      className="absolute animate-plaqueFlicker text-center"
      style={{
        left: "50%",
        top: "38%",
        transform: "translate(-50%, -50%)",
        padding: "14px 22px 12px",
        background:
          "linear-gradient(180deg, rgba(34,17,42,0.95) 0%, rgba(20,9,30,0.95) 100%)",
        boxShadow: [
          "0 0 0 1px #b97f3a inset",
          "0 0 0 3px #1a0e22 inset",
          "0 1px 0 0 #1a0e22",
          "0 2px 0 0 #b97f3a",
          "0 6px 22px rgba(0,0,0,0.55)",
        ].join(", "),
        imageRendering: "pixelated",
        minWidth: 200,
      }}
    >
      <div
        className="font-japan"
        style={{ fontSize: 28, lineHeight: 1, marginBottom: 6 }}
      >
        {emoji}
      </div>
      <div
        className="font-pixel"
        style={{
          fontSize: 13,
          color: "#ffd9a8",
          letterSpacing: 1.5,
          marginBottom: 4,
          textShadow: "0 0 6px rgba(255,217,168,0.45)",
        }}
      >
        {name.toUpperCase()}
      </div>
      <div
        className="font-mono"
        style={{ fontSize: 12, color: "var(--muted)", letterSpacing: 1 }}
      >
        {role ?? "resident"}
      </div>
    </div>
  );
}

function Floor() {
  // The floor sits in the bottom 38%. The skirting board (踢腳線) at
  // its top edge — 1px solid `--a3` — is what most strongly sells the
  // "interior" read.
  return (
    <div
      className="absolute left-0 right-0 bottom-0"
      style={{
        height: "38%",
        background: "linear-gradient(180deg, #0a0418 0%, #050010 100%)",
        backgroundImage:
          "linear-gradient(180deg, #0a0418 0%, #050010 100%), repeating-linear-gradient(0deg, transparent 0 11px, rgba(167,139,250,0.06) 11px 12px)",
        backgroundBlendMode: "normal",
        borderTop: "1px solid var(--a3)",
        boxShadow: "inset 0 1px 0 0 rgba(196,181,253,0.18)",
      }}
    >
      {/* Floor reflection of the wall light — a thin amber band right
          under the skirting. Tiny detail, but it visually anchors the
          plaque. */}
      <div
        style={{
          position: "absolute",
          top: 2,
          left: "30%",
          right: "30%",
          height: 2,
          background: "linear-gradient(90deg, transparent, rgba(252,211,77,0.18), transparent)",
        }}
      />
    </div>
  );
}

function LockedRoom({ roomId }: { roomId: string }) {
  return (
    <main className="absolute inset-0 grid place-items-center bg-bg">
      <div
        className="text-center font-japan animate-plaqueFlicker"
        style={{
          padding: "18px 26px 16px",
          background: "linear-gradient(180deg, rgba(34,17,42,0.95), rgba(20,9,30,0.95))",
          boxShadow: [
            "0 0 0 1px #b97f3a inset",
            "0 0 0 3px #1a0e22 inset",
            "0 2px 0 0 #b97f3a",
          ].join(", "),
          color: "#ffd9a8",
        }}
      >
        <div style={{ fontSize: 28, marginBottom: 8 }}>🔒</div>
        <div className="font-pixel" style={{ fontSize: 12, letterSpacing: 1.5, marginBottom: 6 }}>
          ROOM LOCKED
        </div>
        <div className="font-mono text-muted" style={{ fontSize: 12, letterSpacing: 0.8 }}>
          訪客機制 Phase 8 啟用
        </div>
        <div className="font-mono text-muted" style={{ fontSize: 10, marginTop: 6, opacity: 0.6 }}>
          id: {roomId.slice(0, 8)}…
        </div>
        <div style={{ marginTop: 14 }}>
          <Link
            href="/town"
            className="font-japan text-amber hover:text-text transition-colors"
            style={{ fontSize: 12 }}
          >
            ◂ 回街景
          </Link>
        </div>
      </div>
    </main>
  );
}

function MissingRoom() {
  return (
    <main className="absolute inset-0 grid place-items-center bg-bg">
      <div className="font-japan text-muted text-center">
        <div style={{ fontSize: 28 }}>🚪</div>
        <div style={{ fontSize: 13, marginTop: 10 }}>找不到這間房</div>
        <Link
          href="/town"
          className="font-japan text-amber hover:text-text transition-colors"
          style={{ fontSize: 12, marginTop: 16, display: "inline-block" }}
        >
          ◂ 回街景
        </Link>
      </div>
    </main>
  );
}
