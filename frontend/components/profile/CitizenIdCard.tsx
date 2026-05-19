"use client";

import { useMemo } from "react";

import { PixelSprite } from "@/components/pixel/PixelSprite";
import { PixelWord } from "@/components/pixel/PixelWord";
import { XpBar } from "@/components/profile/XpBar";
import { Link } from "@/i18n/routing";
import { characterKeyToAvatar } from "@/lib/data/character-to-avatar";
import type { PublicUserProfile } from "@/lib/api/endpoints";

interface CitizenIdCardProps {
  profile: PublicUserProfile;
  /** Optional override for the streak value — backend doesn't compute
   *  it yet in round 1, so the page passes `null` and the card shows "—". */
  streakDays?: number | null;
  /** Optional all-time hours — same caveat. */
  allTimeHours?: number | null;
  /** Optional level / xp — same caveat. */
  level?: number | null;
  xp?: number | null;
  xpNextLevel?: number | null;
  /** Optional "favorite scene" + city — same caveat. */
  favoriteScene?: string | null;
  city?: string | null;
}

/**
 * Citizen ID — a holographic pixel-CRT membership card. Suspended over
 * the town sky on `/users/[id]`. Treatment guide:
 *
 * - Card body: pixel-panel with a secondary inner stroke that reads as a
 *   holo-laminate edge.
 * - Four corner notches (◤◥◣◢) in accent-2 — arcade-cab rivets.
 * - Header strip ticks with `animate-pixelTicker` so the card feels live.
 * - Avatar halo + name glow reuse the existing `animate-neonFlicker` keyframe.
 * - XP bar uses the `.xp-bar` / `.xp-cell` primitives (see globals.css).
 *
 * Per round 1: stats the backend can't compute yet render as "—" rather
 * than fake numbers, so the page reads honestly. The barcode at the
 * bottom is seeded by `profile.id` so each citizen shows a stable bar
 * pattern across reloads.
 */
export function CitizenIdCard({
  profile,
  streakDays = null,
  allTimeHours = null,
  level = null,
  xp = null,
  xpNextLevel = null,
  favoriteScene = null,
  city = null,
}: CitizenIdCardProps) {
  const avatar = characterKeyToAvatar(profile.character_key);
  const barcode = useMemo(() => buildBarcode(profile.id), [profile.id]);
  const idCode = useMemo(() => shortCode(profile.id), [profile.id]);

  const showXp = xp != null && xpNextLevel != null;

  return (
    <article
      data-testid="citizen-id-card"
      className="id-card pixel-panel animate-fadeUp animate-floatMoon relative"
      style={{
        width: "min(760px, calc(100vw - 32px))",
        background: "rgba(17, 8, 38, 0.92)",
        border: "1px solid var(--panel-stroke-strong)",
        boxShadow:
          "inset 0 0 0 4px rgba(167,139,250,0.18), 0 18px 48px rgba(0,0,0,0.55)",
        // Slow the floatMoon a touch so the card breathes rather than
        // bobbing; floatMoon defaults are tuned for the moon sprite.
        animationDuration: "8s, 14s",
      }}
    >
      <CornerNotch position="tl" />
      <CornerNotch position="tr" />
      <CornerNotch position="bl" />
      <CornerNotch position="br" />

      <header
        className="font-silkscreen animate-pixelTicker"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "0 0 12px 0",
          marginBottom: 14,
          borderBottom: "1px dashed var(--accent)",
          backgroundImage:
            "linear-gradient(90deg, var(--accent) 0 4px, transparent 4px 12px)",
          backgroundRepeat: "repeat-x",
          backgroundPosition: "0 100%",
          backgroundSize: "12px 1px",
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontSize: 11,
            color: "var(--ink-mute)",
            letterSpacing: "0.3em",
          }}
        >
          <span
            aria-hidden
            style={{
              width: 8,
              height: 8,
              background: "var(--accent-2)",
              boxShadow: "var(--neon-glow-pink)",
            }}
          />
          ▣ CITIZEN ID
        </span>
        <span
          style={{
            fontSize: 11,
            color: "var(--accent)",
            letterSpacing: "0.25em",
            textShadow: "var(--neon-glow)",
          }}
        >
          NO. {idCode} {level != null ? `/ LV.${level}` : ""}
        </span>
      </header>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "112px 1fr",
          gap: 18,
          alignItems: "center",
        }}
      >
        <div
          className="animate-neonFlicker"
          style={{
            width: 96,
            height: 96,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "1px solid var(--accent)",
            background: "rgba(0,0,0,0.45)",
            boxShadow: "0 0 24px rgba(236,72,153,0.55)",
          }}
        >
          <PixelSprite sprite={avatar.sprite} palette={avatar.palette} scale={5} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <PixelWord
              text={(profile.display_name || "CITIZEN").toUpperCase()}
              scale={2}
              color="var(--accent)"
              glow="var(--accent-2)"
            />
            <div
              className="font-silkscreen"
              style={{
                fontSize: 10,
                color: "var(--ink-mute)",
                letterSpacing: "0.2em",
                marginTop: 6,
              }}
            >
              {profile.role_label || avatar.name || "—"}
            </div>
          </div>

          {showXp ? (
            <XpBar
              xp={xp}
              xpNext={xpNextLevel}
              label={`XP ${xp} / ${xpNextLevel}`}
              ariaLabel={`XP ${xp} of ${xpNextLevel}`}
            />
          ) : null}
        </div>
      </section>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 10,
          marginTop: 18,
        }}
      >
        <StatCell label="TODAY" value={`${profile.today_focus_minutes} MIN`} />
        <StatCell
          label="STREAK"
          value={streakDays != null ? `${streakDays} D` : "—"}
        />
        <StatCell
          label="ALL-TIME"
          value={allTimeHours != null ? `${allTimeHours} H` : "—"}
        />
      </section>

      <section
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 14,
          alignItems: "center",
          marginTop: 18,
        }}
      >
        <Chip label="FAV SCENE" value={favoriteScene ?? "—"} accent="var(--accent-3)" />
        <Chip label="LOCATION" value={city ?? "—"} accent="var(--accent)" />
        <span
          className="font-silkscreen"
          style={{
            fontSize: 9,
            color: "var(--ink-dim)",
            letterSpacing: "0.2em",
            marginLeft: "auto",
          }}
        >
          JOINED · {formatJoined(profile.joined_at)}
        </span>
      </section>

      <footer
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          marginTop: 22,
          paddingTop: 14,
          borderTop: "1px dashed var(--panel-stroke)",
        }}
      >
        <div
          aria-hidden
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: 2,
            height: 28,
            color: "var(--ink-dim)",
          }}
        >
          {barcode.map((w, i) => (
            <span
              key={i}
              style={{
                width: w,
                height: 24,
                background: "currentColor",
                opacity: i % 3 === 0 ? 0.55 : 0.9,
              }}
            />
          ))}
          <span
            className="font-silkscreen"
            style={{
              marginLeft: 8,
              fontSize: 9,
              color: "var(--ink-dim)",
              letterSpacing: "0.2em",
            }}
          >
            ID-{idCode}
          </span>
        </div>
        <Link
          href="/town"
          className="font-silkscreen"
          style={{
            fontSize: 11,
            color: "var(--accent-3)",
            letterSpacing: "0.2em",
            textDecoration: "none",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "var(--accent-2)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "var(--accent-3)";
          }}
        >
          ← BACK TO TOWN
        </Link>
      </footer>
    </article>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="pixel-panel"
      style={{
        padding: "10px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        boxShadow: "inset 0 0 0 1px rgba(167,139,250,0.18)",
      }}
    >
      <span
        className="font-silkscreen"
        style={{
          fontSize: 9,
          color: "var(--ink-mute)",
          letterSpacing: "0.25em",
        }}
      >
        {label}
      </span>
      <span
        className="font-silkscreen"
        style={{
          fontSize: 18,
          color: "var(--accent-2)",
          textShadow: "var(--neon-glow-pink)",
          letterSpacing: "0.05em",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function Chip({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <span
      className="font-silkscreen"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        fontSize: 10,
        color: "var(--ink)",
        letterSpacing: "0.15em",
        border: `1px solid ${accent}`,
        background: "rgba(7,4,26,0.55)",
      }}
    >
      <span style={{ color: accent }}>◉</span>
      <span style={{ color: "var(--ink-mute)" }}>{label}</span>
      <span>{value}</span>
    </span>
  );
}

function CornerNotch({ position }: { position: "tl" | "tr" | "bl" | "br" }) {
  const base = {
    position: "absolute",
    width: 14,
    height: 14,
    background: "var(--accent-2)",
    boxShadow: "var(--neon-glow-pink)",
  } as const;
  const map = {
    tl: { top: -6, left: -6 },
    tr: { top: -6, right: -6 },
    bl: { bottom: -6, left: -6 },
    br: { bottom: -6, right: -6 },
  } as const;
  return <span aria-hidden style={{ ...base, ...map[position] }} />;
}

/**
 * Generate 28 vertical bar widths seeded by the user id so the barcode
 * stays stable across reloads but each citizen shows their own pattern.
 */
function buildBarcode(seed: string): number[] {
  const bars: number[] = [];
  let h = 5381;
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) + h + seed.charCodeAt(i)) | 0;
  }
  for (let i = 0; i < 28; i++) {
    h = (h * 1664525 + 1013904223) | 0;
    const v = Math.abs(h) % 4;
    bars.push([1, 2, 1, 3][v] ?? 1);
  }
  return bars;
}

/** Compact 6-char id derived from the user id for the "NO." display. */
function shortCode(id: string): string {
  if (!id) return "------";
  const clean = id.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return (clean.slice(0, 4) + clean.slice(-2)).padEnd(6, "0");
}

function formatJoined(iso: string): string {
  try {
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return `${y}.${m}`;
  } catch {
    return "—";
  }
}
