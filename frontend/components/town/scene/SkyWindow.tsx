"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { useRouter } from "@/i18n/routing";
import { leaderboardApi } from "@/lib/api/endpoints";
import type { LeaderboardEntry } from "@/lib/api/types.gen";
import { BlinkDot } from "@/components/pixel/BlinkDot";
import { BroadcastClipPlayer } from "@/components/scene/BroadcastClipPlayer";
import { PixelSprite } from "@/components/pixel/PixelSprite";
import { AVATARS, type AvatarDef } from "@/lib/pixel/sprites/avatars";
import { BATTERY } from "@/lib/pixel/sprites/props";
import { findCharacter } from "@/lib/data/characters";
import { usePresenceStore } from "@/lib/state/presenceStore";
import {
  BROADCAST_MODES,
  BROADCAST_ROTATE_MS,
  buildYouTubeEmbedSrc,
  type BroadcastMode,
} from "@/lib/data/broadcast";

const RANK_BADGE_COLORS = ["#fcd34d", "#cbd5e1", "#fb923c"];
const RANK_BADGE_LABELS = ["CHAMP", "SILVER", "BRONZE"];

/**
 * The "FOCUS BROADCAST" sky window — replaces `LeaderboardWindow`.
 * A pixel-bordered pane floats just under the top HUD with an
 * antenna mount + blinking transmitter dot on top, a tabbed body
 * that swaps between leaderboard rank rows and sponsor/video broadcast
 * (rank ↔ ad is user-toggled via the title-bar pills; the broadcast
 * carousel inside the ad tab rotates every BROADCAST_ROTATE_MS).
 *
 * Backend data: the rank tab calls `leaderboardApi.today()` (same
 * source as before, polled every 30 s). The ad tab is purely
 * decorative — 3 client-only entries that rotate every 3 s.
 */
export function SkyWindow() {
  const [tab, setTab] = useState<"rank" | "ad">("rank");
  // Broadcast index lives here, not in AdSpace, because AdSpace stays
  // mounted-but-hidden when the user is on the rank tab; if idx lived
  // inside AdSpace it would still survive (no remount now), but keeping
  // it in the parent also lets the indicator dots reflect progress even
  // while the rank tab is showing.
  const [adIdx, setAdIdx] = useState(0);
  const t = useTranslations("town");
  const onlineCount = usePresenceStore((s) => Object.keys(s.byId).length);

  useEffect(() => {
    if (BROADCAST_MODES.length <= 1) return;
    const id = window.setInterval(
      () => setAdIdx((i) => (i + 1) % BROADCAST_MODES.length),
      BROADCAST_ROTATE_MS,
    );
    return () => window.clearInterval(id);
  }, []);

  return (
    <div
      data-testid="sky-window"
      className="absolute z-[5] pointer-events-none"
      style={{
        top: 92,
        left: "50%",
        transform: "translateX(-50%)",
        width: 520,
        maxWidth: "calc(100% - 32px)",
      }}
    >
      <div
        className="pixel-panel relative"
        style={{
          padding: 0,
          background: "rgba(7,4,26,0.94)",
          border: "2px solid var(--accent)",
          boxShadow: "var(--neon-glow), 0 18px 40px rgba(0,0,0,0.6)",
          pointerEvents: "auto",
        }}
      >
        {/* Corner brackets */}
        <CornerDeco />

        {/* Title bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "6px 12px",
            borderBottom: "1px solid var(--panel-stroke)",
            background:
              "linear-gradient(90deg, rgba(183,148,246,0.15), transparent)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <BlinkDot color="var(--accent-2)" size={8} />
            <span
              className="font-silkscreen"
              style={{
                fontSize: 11,
                color: "var(--accent)",
                letterSpacing: "0.3em",
                textShadow: "var(--neon-glow)",
              }}
            >
              {t("focusBroadcast")}
            </span>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <TabPill active={tab === "rank"} onClick={() => setTab("rank")}>
              {t("todayRank")}
            </TabPill>
            <TabPill active={tab === "ad"} onClick={() => setTab("ad")}>
              {t("skyAd")}
            </TabPill>
          </div>
        </div>

        {/* Lock the body to a single height so toggling between rank and
            ad tabs doesn't reflow the floating panel (AdSpace is naturally
            taller than RankBoard). Both panels stay mounted and we toggle
            visibility so the broadcast video element survives every tab
            flip — unmounting AdSpace every 6 s restarts the <video>. */}
        <div style={{ height: 220, overflow: "hidden", position: "relative" }}>
          <div
            style={{
              position: "absolute",
              inset: 0,
              visibility: tab === "rank" ? "visible" : "hidden",
              pointerEvents: tab === "rank" ? "auto" : "none",
            }}
          >
            <RankBoard />
          </div>
          <div
            style={{
              position: "absolute",
              inset: 0,
              visibility: tab === "ad" ? "visible" : "hidden",
              pointerEvents: tab === "ad" ? "auto" : "none",
            }}
          >
            <AdSpace idx={adIdx} />
          </div>
        </div>

        {/* Bottom signal bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "4px 10px",
            borderTop: "1px solid var(--panel-stroke)",
            background: "rgba(0,0,0,0.4)",
          }}
        >
          <div
            className="font-silkscreen"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 9,
              color: "var(--ink-dim)",
              letterSpacing: "0.15em",
            }}
          >
            <SignalBars />
            <span data-testid="sky-window-online">
              {t("liveOnline", { count: onlineCount })}
            </span>
          </div>
          <span
            className="font-silkscreen"
            style={{
              fontSize: 9,
              color: "var(--accent-3)",
              letterSpacing: "0.15em",
            }}
          >
            {t("channel")}
          </span>
        </div>
      </div>

      {/* Antenna mount + transmitter dot */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: -24,
          left: "50%",
          transform: "translateX(-50%)",
          width: 4,
          height: 24,
          background: "var(--accent)",
          boxShadow: "var(--neon-glow)",
        }}
      />
      <div
        aria-hidden
        className="animate-blinkSoft"
        style={{
          position: "absolute",
          top: -30,
          left: "50%",
          transform: "translateX(-50%)",
          width: 12,
          height: 12,
          background: "var(--accent-2)",
          borderRadius: "50%",
          boxShadow: "var(--neon-glow-pink)",
        }}
      />
    </div>
  );
}

function RankBoard() {
  const [rows, setRows] = useState<LeaderboardEntry[]>([]);
  const locale = useLocale();
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await leaderboardApi.today();
        if (!cancelled) setRows(data);
      } catch {
        /* ignored — re-tries on the next interval tick */
      }
    };
    void load();
    const id = window.setInterval(load, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  // No more demo fallback rows — real leaderboard data or an empty
  // state. A fresh deployment with zero completed pomodoros must read
  // honestly rather than show fabricated names.
  const display = rows.slice(0, 5);
  const tEmpty = useTranslations("town.leaderboard");

  if (display.length === 0) {
    return (
      <div
        data-testid="sky-window-rank"
        style={{
          padding: "24px 14px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          color: "var(--ink-dim)",
          fontFamily: "var(--font-silkscreen), monospace",
          letterSpacing: "0.2em",
          fontSize: 11,
        }}
      >
        {tEmpty("empty")}
      </div>
    );
  }

  return (
    <div
      data-testid="sky-window-rank"
      style={{
        padding: "10px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      {display.map((r, i) => {
        const rank = i + 1;
        const badgeColor = i < 3 ? RANK_BADGE_COLORS[i] : undefined;
        const badgeLabel = i < 3 ? RANK_BADGE_LABELS[i] : undefined;
        const avatar = pickAvatarFor(r);
        return (
          <button
            key={r.user_id}
            type="button"
            data-testid={`sky-window-rank-row-${rank}`}
            onClick={() => router.push(`/users/${r.user_id}`)}
            className="font-silkscreen"
            style={{
              display: "grid",
              gridTemplateColumns: "28px 28px 1fr auto 60px",
              gap: 10,
              alignItems: "center",
              padding: "4px 8px",
              textAlign: "left",
              cursor: "pointer",
              background:
                rank === 1
                  ? "rgba(252,211,77,0.1)"
                  : rank === 2
                    ? "rgba(203,213,225,0.07)"
                    : rank === 3
                      ? "rgba(251,146,60,0.07)"
                      : "transparent",
              border:
                badgeColor
                  ? `1px solid ${badgeColor}44`
                  : "1px solid transparent",
              transition: "filter 120ms ease",
              filter: "brightness(1)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.filter = "brightness(1.18)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.filter = "brightness(1)";
            }}
          >
            <span
              style={{
                fontSize: 14,
                color: badgeColor ?? "var(--ink-mute)",
                textShadow: badgeColor ? `0 0 6px ${badgeColor}` : "none",
              }}
            >
              #{rank}
            </span>
            <PixelSprite
              sprite={avatar.sprite}
              palette={avatar.palette}
              scale={1.5}
            />
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 12, color: "var(--ink)" }}>
                {r.display_name}
              </span>
              <span
                style={{
                  fontSize: 9,
                  color: "var(--ink-dim)",
                  letterSpacing: "0.1em",
                }}
              >
                {r.completed_count * 25}
                min · {avatar.name}
              </span>
            </div>
            {badgeLabel ? (
              <span
                style={{
                  fontSize: 9,
                  color: badgeColor,
                  letterSpacing: "0.2em",
                  textShadow: `0 0 6px ${badgeColor}`,
                }}
              >
                {badgeLabel}
              </span>
            ) : (
              <span />
            )}
            <span
              style={{
                fontSize: 11,
                color: "var(--accent)",
                display: "flex",
                alignItems: "center",
                gap: 4,
                justifyContent: "flex-end",
              }}
            >
              {r.completed_count}
              <PixelSprite
                sprite={BATTERY.sprite}
                palette={BATTERY.palette}
                scale={1.2}
              />
            </span>
          </button>
        );
      })}
      {/* Locale acknowledged so the component re-renders on language flip
          (no string is interpolated directly from `locale`). */}
      <span aria-hidden style={{ display: "none" }}>{locale}</span>
    </div>
  );
}

function pickAvatarFor(row: LeaderboardEntry): AvatarDef {
  if (row.character_key) {
    const char = findCharacter(row.character_key);
    if (char) {
      // Pick a stable avatar by hashing the character key — keeps the
      // visual consistent across reloads.
      const idx = hashStringToInt(char.key) % AVATARS.length;
      return AVATARS[idx];
    }
  }
  return AVATARS[0];
}

function hashStringToInt(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * Broadcast carousel — replaces the legacy AdSpace. Renders the active
 * `BroadcastMode` from `lib/data/broadcast.ts` inside a shared CRT screen
 * shell (scanlines + vignette overlays) so sponsor cards and live-video
 * picture both read as the same "TV channel". Rotates every
 * `BROADCAST_ROTATE_MS`. Channel chrome (ON AIR pill + channel bug +
 * "AUDIO ← TOWN RADIO") only appears for `video` mode — sponsor mode
 * keeps the original branded-card look so existing copy still applies.
 */
function AdSpace({ idx }: { idx: number }) {
  const tCommon = useTranslations("town");
  const screenRef = useRef<HTMLDivElement>(null);
  const modes = BROADCAST_MODES;

  // Phosphor flash every ~12s — short brightness pulse that sells the
  // channel-changing tic without paying full animation cost.
  useEffect(() => {
    const id = window.setInterval(() => {
      const el = screenRef.current;
      if (!el) return;
      el.style.filter = "brightness(1.25)";
      window.setTimeout(() => {
        if (screenRef.current) screenRef.current.style.filter = "";
      }, 120);
    }, 12_000);
    return () => window.clearInterval(id);
  }, []);

  const mode = modes[idx % modes.length];
  // Pick a single persistent video mode to mount continuously behind the
  // sponsor card. Mode rotation (sponsor → video → sponsor) used to remount
  // VideoPicture every cycle and reload the clip; now the video element
  // lives behind the sponsor card and never tears down.
  const persistentVideo = modes.find(
    (m): m is Extract<BroadcastMode, { kind: "video" }> => m.kind === "video",
  );

  return (
    <div
      data-testid="sky-window-broadcast"
      style={{
        padding: "10px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        minHeight: 168,
      }}
    >
      <div
        ref={screenRef}
        className="tv-screen"
        style={{ background: "rgba(0,0,0,0.55)" }}
      >
        {persistentVideo ? <VideoPicture mode={persistentVideo} /> : null}
        {mode.kind === "sponsor" ? (
          <div style={{ position: "absolute", inset: 0, zIndex: 2 }}>
            <SponsorPicture mode={mode} />
          </div>
        ) : null}
        <div aria-hidden className="tv-scanlines animate-scanDrift" />
        <div aria-hidden className="tv-vignette" />
        {mode.kind === "video" ? (
          <>
            <span
              className="font-silkscreen"
              style={{
                position: "absolute",
                top: 6,
                left: 8,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 9,
                color: "var(--accent-2)",
                letterSpacing: "0.2em",
                textShadow: "var(--neon-glow-pink)",
                background: "rgba(7,4,26,0.7)",
                padding: "2px 6px",
                pointerEvents: "none",
              }}
            >
              <span
                className="animate-blinkSoft"
                style={{
                  width: 6,
                  height: 6,
                  background: "var(--accent-2)",
                  boxShadow: "var(--neon-glow-pink)",
                }}
              />
              {mode.tag}
            </span>
            <span
              className="font-silkscreen"
              style={{
                position: "absolute",
                top: 6,
                right: 8,
                fontSize: 9,
                color: "var(--ink-mute)",
                letterSpacing: "0.15em",
                background: "rgba(7,4,26,0.7)",
                padding: "2px 6px",
                pointerEvents: "none",
              }}
            >
              CH-22 · LIVE
            </span>
            <span
              className="font-silkscreen"
              style={{
                position: "absolute",
                bottom: 6,
                left: 8,
                fontSize: 9,
                color: "var(--accent)",
                letterSpacing: "0.15em",
                textShadow: "var(--neon-glow)",
                background: "rgba(7,4,26,0.7)",
                padding: "2px 6px",
                pointerEvents: "none",
              }}
            >
              {mode.channelLabel}
            </span>
            <span
              className="font-silkscreen"
              style={{
                position: "absolute",
                bottom: 6,
                right: 8,
                fontSize: 9,
                color: "var(--ink-dim)",
                letterSpacing: "0.15em",
                background: "rgba(7,4,26,0.7)",
                padding: "2px 6px",
                pointerEvents: "none",
              }}
            >
              ▣ AUDIO ← TOWN RADIO
            </span>
          </>
        ) : null}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ flex: 1, display: "flex", gap: 4 }}>
          {modes.map((_, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: 3,
                background: i === idx ? "var(--accent)" : "var(--panel-stroke)",
              }}
            />
          ))}
        </div>
        <span
          className="font-silkscreen"
          style={{
            fontSize: 8,
            color: "var(--ink-dim)",
            letterSpacing: "0.2em",
          }}
        >
          {mode.kind === "sponsor" ? "AD" : "LIVE"} · {idx + 1}/{modes.length}
        </span>
      </div>
      <div
        className="font-silkscreen"
        style={{
          fontSize: 8,
          color: "var(--ink-dim)",
          letterSpacing: "0.15em",
          marginTop: "auto",
        }}
      >
        {tCommon("adContact")}
      </div>
    </div>
  );
}

function SponsorPicture({
  mode,
}: {
  mode: Extract<BroadcastMode, { kind: "sponsor" }>;
}) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 8,
        padding: "12px 16px",
        background:
          "linear-gradient(135deg, rgba(125,93,255,0.18), rgba(7,4,26,0.6))",
      }}
    >
      <span
        className="font-silkscreen"
        style={{
          alignSelf: "flex-start",
          padding: "2px 8px",
          background: mode.accent,
          color: "#0a0524",
          fontSize: 10,
          letterSpacing: "0.2em",
          fontWeight: 700,
        }}
      >
        {mode.tag}
      </span>
      <div
        style={{
          fontSize: 14,
          color: "var(--ink)",
          lineHeight: 1.35,
          fontWeight: 500,
        }}
      >
        {mode.title}
      </div>
      <a
        href={mode.href || "#"}
        target={mode.href && mode.href !== "#" ? "_blank" : undefined}
        rel="noopener noreferrer"
        className="pixel-btn"
        style={{
          alignSelf: "flex-start",
          padding: "8px 16px",
          fontSize: 11,
          textDecoration: "none",
        }}
      >
        {mode.label} ›
      </a>
    </div>
  );
}

function VideoPicture({
  mode,
}: {
  mode: Extract<BroadcastMode, { kind: "video" }>;
}) {
  const src = buildYouTubeEmbedSrc(mode.embedId);
  if (!src) {
    // PLACEHOLDER embedId. Prefer the R2 broadcast carousel when configured
    // (returns null silently if the env var is absent or the token fetch
    // fails), and fall back to the static "tuning" picture so the CRT
    // chrome still reads during local dev / when broadcast is offline.
    return (
      <>
        <BroadcastClipPlayer
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--ink-dim)",
            fontFamily: "var(--font-silkscreen), monospace",
            letterSpacing: "0.25em",
            fontSize: 10,
            background:
              "repeating-linear-gradient(135deg, rgba(255,255,255,0.04) 0 6px, transparent 6px 12px)",
            zIndex: -1,
          }}
        >
          TUNING SIGNAL · STAND BY
        </div>
      </>
    );
  }
  return (
    <iframe
      title="Focustown.tv lofi broadcast"
      src={src}
      allow="autoplay; encrypted-media; picture-in-picture"
      referrerPolicy="no-referrer"
    />
  );
}

function SignalBars() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setStep((s) => (s + 1) % 4), 400);
    return () => window.clearInterval(id);
  }, []);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        gap: 1,
        height: 8,
      }}
    >
      {[2, 4, 6, 8].map((h, i) => (
        <div
          key={i}
          style={{
            width: 2,
            height: h,
            background:
              i <= step ? "var(--accent-3)" : "var(--panel-stroke)",
          }}
        />
      ))}
    </div>
  );
}

function TabPill({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className="font-silkscreen"
      style={{
        padding: "4px 10px",
        background: active ? "var(--accent)" : "transparent",
        color: active ? "#0a0524" : "var(--ink-mute)",
        border: `1px solid ${active ? "var(--accent)" : "var(--panel-stroke)"}`,
        fontSize: 9,
        letterSpacing: "0.1em",
        whiteSpace: "nowrap",
        userSelect: "none",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function CornerDeco({ color = "var(--accent)" }: { color?: string }) {
  const c = { position: "absolute", width: 12, height: 12 } as const;
  return (
    <>
      <span aria-hidden style={{ ...c, top: -1, left: -1, borderTop: `2px solid ${color}`, borderLeft: `2px solid ${color}` }} />
      <span aria-hidden style={{ ...c, top: -1, right: -1, borderTop: `2px solid ${color}`, borderRight: `2px solid ${color}` }} />
      <span aria-hidden style={{ ...c, bottom: -1, left: -1, borderBottom: `2px solid ${color}`, borderLeft: `2px solid ${color}` }} />
      <span aria-hidden style={{ ...c, bottom: -1, right: -1, borderBottom: `2px solid ${color}`, borderRight: `2px solid ${color}` }} />
    </>
  );
}
