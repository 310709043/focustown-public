"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { PixelSprite } from "@/components/pixel/PixelSprite";
import { PixelWord } from "@/components/pixel/PixelWord";
import { Logo } from "@/components/scene/Logo";
import { CoinBadge } from "@/components/town/CoinBadge";
import { Link } from "@/i18n/routing";
import { useAuthStore } from "@/lib/state/authStore";
import { usePresenceStore } from "@/lib/state/presenceStore";
import { useSceneStore, type SceneName } from "@/lib/state/sceneStore";
import { TROPHY } from "@/lib/pixel/sprites/props";
import { CAT_WALK } from "@/lib/pixel/sprites/walkers";

import { NavButton } from "./NavButton";
import { UserStatusPill } from "./UserStatusPill";

/**
 * Modal targets the TopHUD can open. PR1 wires achv/shop/feedback/support;
 * PR2 will add friends + profile.
 */
export type TownModalKind =
  | "achv"
  | "shop"
  | "frds"
  | "profile"
  | "feedback"
  | "support";

const TIME_EMOJI: Record<SceneName, string> = {
  night: "🌙",
  midnight: "🌙",
  dawn: "🌅",
  day: "☀",
  dusk: "🌆",
  cloudy: "☀",
  rain: "🌙",
  snow: "🌙",
  storm: "🌙",
};
const WEATHER_LABEL: Record<SceneName, string> = {
  night: "weatherSunny",
  midnight: "weatherSunny",
  dawn: "weatherSunny",
  day: "weatherSunny",
  dusk: "weatherSunny",
  cloudy: "weatherCloudy",
  rain: "weatherRain",
  snow: "weatherSnow",
  storm: "weatherStorm",
};
const WEATHER_ICON: Record<SceneName, string> = {
  night: "☀",
  midnight: "☀",
  dawn: "☀",
  day: "☀",
  dusk: "☀",
  cloudy: "☁",
  rain: "☂",
  snow: "❄",
  storm: "⚡",
};
// Aligned with reference/screen-town.jsx TIME_TEMP: dawn 12 · day 22 · dusk 19
// · night 16 · midnight 11. Weather-collapsed scenes inherit the implied time.
const SCENE_TEMP: Record<SceneName, number> = {
  night: 16,
  midnight: 11,
  dawn: 12,
  day: 22,
  dusk: 19,
  cloudy: 18,
  rain: 16,
  snow: 2,
  storm: 12,
};

const WD = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MN = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/**
 * Town top HUD — visual port of `reference/screen-town.jsx#TopHUD`.
 *
 * Three clusters separated by `space-between`:
 *  • LEFT: Logo + FOCUSTOWN pixelword + "v1.2 · ONLINE N" + weather/time chip
 *  • CENTER: `UserStatusPill` (avatar, name, LV, focusing status, tomato strip)
 *  • RIGHT: ACHV / SHOP / FRDS nav + my-room + clock + T-coin + sign out
 *
 * Replaces `TownNavbar` in `/town/page.tsx`. All click handlers
 * preserve Current's existing routing + store wiring (signOut,
 * roomApi.getMine, leaderboard nav). The locale switcher is rendered
 * by the global LocaleLayout top-right slot.
 */
export function TownTopHUD({
  onOpenModal,
}: {
  onOpenModal: (kind: TownModalKind) => void;
}) {
  const signOut = useAuthStore((s) => s.signOut);
  const scene = useSceneStore((s) => s.current);
  // Presence store may not be hydrated yet on initial paint (SSR + first WS
  // tick). Floor at 1 so the chip never reads as "ONLINE 0" — at minimum the
  // user looking at the page IS online.
  const onlineCount = usePresenceStore(
    (s) => Math.max(Object.keys(s.byId).length, 1),
  );
  const tNav = useTranslations("town.nav");
  const tHud = useTranslations("town");
  const tScene = useTranslations("scenes");
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div
      data-testid="town-top-hud"
      className="absolute top-0 left-0 right-0 z-20"
      style={{
        padding: "10px 18px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 14,
        background:
          "linear-gradient(180deg, rgba(7,4,26,0.85) 0%, rgba(7,4,26,0) 100%)",
      }}
    >
      {/* ═══ LEFT cluster ═══ */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Logo scale={1} />
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <PixelWord
            text="FOCUSTOWN"
            scale={2}
            color="var(--accent)"
            glow="var(--accent)"
          />
          <span
            className="font-silkscreen"
            style={{
              fontSize: 8,
              color: "var(--ink-dim)",
              letterSpacing: "0.2em",
            }}
          >
            v1.2 · {tHud("onlineCount", { count: onlineCount })}
          </span>
        </div>
        <div
          aria-hidden
          style={{
            width: 1,
            height: 28,
            background: "var(--panel-stroke)",
            margin: "0 4px",
          }}
        />
        <div
          className="pixel-panel font-silkscreen"
          style={{
            padding: "5px 10px",
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 10,
            letterSpacing: "0.15em",
            whiteSpace: "nowrap",
          }}
        >
          <span style={{ fontSize: 13 }}>{TIME_EMOJI[scene]}</span>
          <span>{tScene(`${scene}.name`)}</span>
          <span style={{ color: "var(--ink-dim)" }}>·</span>
          <span>
            {WEATHER_ICON[scene]} {tHud(WEATHER_LABEL[scene])}
          </span>
          <span style={{ color: "var(--ink-dim)" }}>·</span>
          <span>{SCENE_TEMP[scene]}°C</span>
        </div>
      </div>

      {/* ═══ CENTER: status pill ═══ */}
      <UserStatusPill />

      {/* ═══ RIGHT cluster ═══ */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <NavButton
          testId="nav-awards"
          icon={
            <PixelSprite sprite={TROPHY.sprite} palette={TROPHY.palette} scale={1.3} />
          }
          label={tNav("achv")}
          onClick={() => onOpenModal("achv")}
        />
        <NavButton
          testId="nav-shop"
          icon="🛒"
          label={tNav("shop")}
          disabled
          title={tNav("shopComingSoonTooltip")}
        />
        <NavButton
          testId="nav-friends"
          icon={
            <PixelSprite
              sprite={CAT_WALK.frames[0]}
              palette={CAT_WALK.palette}
              scale={1.3}
            />
          }
          label={tNav("frds")}
          onClick={() => onOpenModal("frds")}
        />

        {now ? (
          <div
            className="pixel-panel"
            style={{
              padding: "6px 10px",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
              }}
            >
              <div
                className="font-silkscreen"
                style={{
                  fontSize: 16,
                  color: "var(--ink)",
                  letterSpacing: "0.05em",
                }}
              >
                {String(now.getHours()).padStart(2, "0")}:
                {String(now.getMinutes()).padStart(2, "0")}
              </div>
              <div
                className="font-silkscreen"
                style={{
                  fontSize: 8,
                  color: "var(--ink-mute)",
                  letterSpacing: "0.18em",
                }}
              >
                {WD[now.getDay()]} · {MN[now.getMonth()]} {now.getDate()}
              </div>
            </div>
          </div>
        ) : null}

        <CoinBadge />

        {/* Compact feedback + support icon buttons — PR1 entry point. PR2
            may consolidate these into the profile/sign-out menu. */}
        <button
          data-testid="nav-feedback"
          onClick={() => onOpenModal("feedback")}
          aria-label={tNav("feedbackAria")}
          className="font-silkscreen"
          style={{
            background: "rgba(7,4,26,0.75)",
            border: "1px solid var(--panel-stroke)",
            padding: "6px 8px",
            fontSize: 11,
            color: "var(--ink-mute)",
            cursor: "pointer",
          }}
        >
          ✎
        </button>
        <button
          data-testid="nav-support"
          onClick={() => onOpenModal("support")}
          aria-label={tNav("supportAria")}
          className="font-silkscreen"
          style={{
            background: "rgba(7,4,26,0.75)",
            border: "1px solid var(--panel-stroke)",
            padding: "6px 8px",
            fontSize: 11,
            color: "var(--ink-mute)",
            cursor: "pointer",
          }}
        >
          ?
        </button>

        <Link
          data-testid="nav-logout"
          href="/"
          className="font-silkscreen"
          onClick={() => signOut()}
          style={{
            background: "rgba(7,4,26,0.75)",
            border: "1px solid var(--panel-stroke)",
            padding: "6px 10px",
            fontSize: 9,
            color: "var(--ink-mute)",
            letterSpacing: "0.15em",
            textDecoration: "none",
          }}
        >
          {tNav("signout")}
        </Link>
      </div>
    </div>
  );
}
