"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { leaderboardApi } from "@/lib/api/endpoints";
import type { LeaderboardEntry } from "@/lib/api/types.gen";
import { BlinkDot } from "@/components/pixel/BlinkDot";
import { PixelSprite } from "@/components/pixel/PixelSprite";
import { AVATARS, type AvatarDef } from "@/lib/pixel/sprites/avatars";
import { TOMATO } from "@/lib/pixel/sprites/props";
import { findCharacter } from "@/lib/data/characters";

const RANK_BADGE_COLORS = ["#fcd34d", "#cbd5e1", "#fb923c"];
const RANK_BADGE_LABELS = ["CHAMP", "SILVER", "BRONZE"];

/**
 * The "FOCUS BROADCAST" sky window — replaces `LeaderboardWindow`.
 * A pixel-bordered pane floats just under the top HUD with an
 * antenna mount + blinking transmitter dot on top, a tabbed body
 * that swaps between leaderboard rank rows and rotating sponsor
 * ads every 6 s, and a signal-bar + LIVE indicator at the bottom.
 *
 * Backend data: the rank tab calls `leaderboardApi.today()` (same
 * source as before, polled every 30 s). The ad tab is purely
 * decorative — 3 client-only entries that rotate every 3 s.
 */
export function SkyWindow() {
  const [tab, setTab] = useState<"rank" | "ad">("rank");
  const t = useTranslations("town");

  useEffect(() => {
    const id = window.setInterval(
      () => setTab((x) => (x === "rank" ? "ad" : "rank")),
      6000,
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

        {tab === "rank" ? <RankBoard /> : <AdSpace />}

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
            <span>{t("liveOnline", { count: 2847 })}</span>
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

  // Falls back to a curated sample so the broadcast pane reads "live"
  // even before the API responds.
  const display = rows.length > 0 ? rows.slice(0, 5) : SAMPLE_ROWS;

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
        const isLive = "user_id" in r;
        return (
          <div
            key={isLive ? r.user_id : r.sampleId}
            className="font-silkscreen"
            style={{
              display: "grid",
              gridTemplateColumns: "28px 28px 1fr auto 60px",
              gap: 10,
              alignItems: "center",
              padding: "4px 8px",
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
                {"display_name" in r ? r.display_name : r.sampleName}
              </span>
              <span
                style={{
                  fontSize: 9,
                  color: "var(--ink-dim)",
                  letterSpacing: "0.1em",
                }}
              >
                {"completed_count" in r
                  ? r.completed_count * 25
                  : r.sampleMins}
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
              {"completed_count" in r ? r.completed_count : r.samplePomos}
              <PixelSprite
                sprite={TOMATO.sprite}
                palette={TOMATO.palette}
                scale={1.2}
              />
            </span>
          </div>
        );
      })}
      {/* Locale acknowledged so the component re-renders on language flip
          (no string is interpolated directly from `locale`). */}
      <span aria-hidden style={{ display: "none" }}>{locale}</span>
    </div>
  );
}

interface SampleRow {
  readonly sampleId: string;
  readonly sampleName: string;
  readonly sampleMins: number;
  readonly samplePomos: number;
}

const SAMPLE_ROWS: readonly SampleRow[] = [
  { sampleId: "s1", sampleName: "Kai", sampleMins: 325, samplePomos: 13 },
  { sampleId: "s2", sampleName: "Bear", sampleMins: 275, samplePomos: 11 },
  { sampleId: "s3", sampleName: "Aria", sampleMins: 225, samplePomos: 9 },
  { sampleId: "s4", sampleName: "Panda", sampleMins: 200, samplePomos: 8 },
  { sampleId: "s5", sampleName: "Doc", sampleMins: 175, samplePomos: 7 },
];

function pickAvatarFor(row: LeaderboardEntry | SampleRow): AvatarDef {
  if ("character_key" in row && row.character_key) {
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

function AdSpace() {
  const [idx, setIdx] = useState(0);
  const t = useTranslations("town.skyAds");
  const tCommon = useTranslations("town");
  const ads = [
    { tagKey: "sponsorTag", titleKey: "sponsorTitle", ctaKey: "sponsorCta", accent: "#fff" },
    { tagKey: "proTag", titleKey: "proTitle", ctaKey: "proCta", accent: "var(--accent-2)" },
    { tagKey: "eventTag", titleKey: "eventTitle", ctaKey: "eventCta", accent: "var(--accent-3)" },
  ];

  useEffect(() => {
    const id = window.setInterval(
      () => setIdx((i) => (i + 1) % ads.length),
      3000,
    );
    return () => window.clearInterval(id);
  }, [ads.length]);

  const ad = ads[idx];

  return (
    <div
      data-testid="sky-window-ad"
      style={{
        padding: "10px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        minHeight: 156,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span
          className="font-silkscreen"
          style={{
            padding: "2px 8px",
            background: ad.accent,
            color: "#0a0524",
            fontSize: 10,
            letterSpacing: "0.2em",
            fontWeight: 700,
          }}
        >
          {t(ad.tagKey)}
        </span>
        <span
          className="font-silkscreen"
          style={{
            fontSize: 8,
            color: "var(--ink-dim)",
            letterSpacing: "0.2em",
          }}
        >
          AD · {idx + 1}/{ads.length}
        </span>
      </div>
      <div
        style={{
          fontSize: 15,
          color: "var(--ink)",
          lineHeight: 1.4,
          fontWeight: 500,
        }}
      >
        {t(ad.titleKey)}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 4 }}>
        <button
          type="button"
          className="pixel-btn"
          style={{ padding: "8px 16px", fontSize: 11 }}
        >
          {t(ad.ctaKey)}
        </button>
        <div style={{ flex: 1, display: "flex", gap: 4 }}>
          {ads.map((_, i) => (
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
      onClick={onClick}
      className="font-silkscreen"
      style={{
        padding: "4px 10px",
        background: active ? "var(--accent)" : "transparent",
        color: active ? "#0a0524" : "var(--ink-mute)",
        border: `1px solid ${active ? "var(--accent)" : "var(--panel-stroke)"}`,
        fontSize: 9,
        letterSpacing: "0.1em",
        cursor: "pointer",
        whiteSpace: "nowrap",
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
