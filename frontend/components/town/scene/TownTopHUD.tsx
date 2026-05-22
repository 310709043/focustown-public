"use client";

import { useTranslations } from "next-intl";

import { MiniClock } from "@/components/chrome/MiniClock";
import { PixelSprite } from "@/components/pixel/PixelSprite";
import { Logo } from "@/components/scene/Logo";
import { CoinBadge } from "@/components/town/CoinBadge";
import { useRouter } from "@/i18n/routing";
import { roomApi } from "@/lib/api/endpoints";
import { useImmersiveFocus } from "@/lib/hooks/useImmersiveFocus";
import { usePrefersReducedMotion } from "@/lib/hooks/usePrefersReducedMotion";
import { usePresenceStore } from "@/lib/state/presenceStore";
import { useSceneStore, type SceneName } from "@/lib/state/sceneStore";
import { TROPHY } from "@/lib/pixel/sprites/props";
import { CAT_WALK } from "@/lib/pixel/sprites/walkers";

import { NavButton } from "./NavButton";
import { UserStatusPill } from "./UserStatusPill";

/** Modal targets the TopHUD can open. */
export type TownModalKind = "achv" | "shop" | "frds" | "profile";

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


/**
 * Town top HUD — visual port of `reference/screen-town.jsx#TopHUD`.
 *
 * Three clusters separated by `space-between`:
 *  • LEFT: LBT logo + v1.4.0 + scene/weather/temp + ONLINE N
 *  • CENTER: `UserStatusPill` (avatar, name, LV, focusing status, tomato strip)
 *  • RIGHT: ACHV / SHOP / FRDS nav + my-room + clock + T-coin
 *
 * Click handlers wire roomApi.getMine and leaderboard nav; sign-out lives
 * in the profile modal now (single-signout cleanup), not the top strip.
 * The locale switcher is rendered by the global LocaleLayout top-right slot.
 */
export function TownTopHUD({
  onOpenModal,
  onOpenOwnProfile,
  edgeRevealed = false,
  onEdgeEnter,
  onEdgeLeave,
}: {
  onOpenModal: (kind: TownModalKind) => void;
  /** Click handler for the central UserStatusPill — opens the user's
   *  own Citizen ID card at `/users/{user.id}`. Optional so existing
   *  callers stay source-compatible. */
  onOpenOwnProfile?: () => void;
  /** City-Mode immersive: when the user hovers the top edge sentinel
   *  (or this HUD itself), the parent flips `edgeRevealed` true so the
   *  collapsed cluster slides back in. Lifted to /town so the sentinel
   *  and HUD share one state machine. */
  edgeRevealed?: boolean;
  onEdgeEnter?: () => void;
  onEdgeLeave?: () => void;
}) {
  const router = useRouter();
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

  // City Mode immersive: collapse everything except LOGO, weather chip,
  // and MiniClock. The user picked this trio so the top strip keeps a
  // sense of place + time without obstructing the city sky.
  const immersive = useImmersiveFocus();
  const reduceMotion = usePrefersReducedMotion();
  const collapsed = immersive && !edgeRevealed;
  const collapsedStyle = (translateY: string): React.CSSProperties => ({
    transition: reduceMotion
      ? "none"
      : "opacity 300ms ease-out, transform 350ms cubic-bezier(0.22,1,0.36,1)",
    opacity: collapsed ? 0 : 1,
    transform: collapsed ? `translateY(${translateY})` : "translateY(0)",
    pointerEvents: collapsed ? "none" : "auto",
  });
  return (
    <div
      data-testid="town-top-hud"
      className="absolute top-0 left-0 right-0 z-20"
      onPointerEnter={immersive ? onEdgeEnter : undefined}
      onPointerLeave={immersive ? onEdgeLeave : undefined}
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
      {/* ═══ LEFT cluster: logo + version · scene/weather/temp · ONLINE ═══
           City-Mode immersive keeps the LOGO + weather chip anchored; the
           version chip + ONLINE chip collapse upward so the sky breathes. */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Logo scale={1.05} />
        <span
          data-testid="top-hud-version"
          className="font-silkscreen"
          style={{
            fontSize: 9,
            color: "var(--ink-dim)",
            letterSpacing: "0.2em",
            ...collapsedStyle("-12px"),
          }}
        >
          v1.4.0
        </span>
        <div
          aria-hidden
          style={{
            width: 1,
            height: 24,
            background: "var(--panel-stroke)",
            margin: "0 2px",
            ...collapsedStyle("-12px"),
          }}
        />
        <div
          data-testid="weather-badge"
          data-scene={scene}
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
        <div
          data-testid="top-hud-online"
          className="pixel-panel font-silkscreen"
          style={{
            padding: "5px 10px",
            fontSize: 10,
            letterSpacing: "0.2em",
            color: "#6ee7b7",
            whiteSpace: "nowrap",
            ...collapsedStyle("-12px"),
          }}
        >
          {tHud("onlineCount", { count: onlineCount })}
        </div>
      </div>

      {/* ═══ CENTER: status pill ═══
           Collapses during immersive focus so the centered countdown
           (mounted in town/page.tsx as <ImmersiveCountdown />) can own
           the centre slot without overlap. */}
      <div style={collapsedStyle("-10px")}>
        <UserStatusPill onClick={onOpenOwnProfile} />
      </div>

      {/* ═══ RIGHT cluster ═══
           MiniClock stays anchored (per the user's chosen trio);
           everything else collapses upward when immersive. */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div
          data-testid="top-hud-right-cluster"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            ...collapsedStyle("-100%"),
          }}
        >
          <NavButton
            testId="nav-awards"
            icon={
              <PixelSprite sprite={TROPHY.sprite} palette={TROPHY.palette} scale={1.3} />
            }
            label={tNav("achv")}
            onClick={() => onOpenModal("achv")}
          />
          {/* 2026-05-21: nav-my-room + nav-shop hidden from the top bar
              per UX request. Code (NavButton, roomApi.getMine, ShopModal,
              myRoom/shop translations) kept intact so flipping the
              constant below restores both entries without further work. */}
          {false && (
            <>
              <NavButton
                testId="nav-my-room"
                icon="🏠"
                label={tNav("myRoom")}
                title={tNav("myRoomTooltip")}
                onClick={async () => {
                  const room = await roomApi.getMine();
                  router.push(
                    `/town/room/${room.id}` as Parameters<typeof router.push>[0],
                  );
                }}
              />
              <NavButton
                testId="nav-shop"
                icon="🛒"
                label={tNav("shop")}
                disabled
                title={tNav("shopComingSoonTooltip")}
              />
            </>
          )}
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
        </div>

        <MiniClock />

        <div style={collapsedStyle("-100%")}>
          <CoinBadge />
        </div>
      </div>
    </div>
  );
}
