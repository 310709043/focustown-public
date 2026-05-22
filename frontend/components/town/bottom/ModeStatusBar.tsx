"use client";

import { useTranslations } from "next-intl";

import { useRouter } from "@/i18n/routing";
import { usePresenceStore } from "@/lib/state/presenceStore";
import {
  useStationStore,
  selectActiveConnection,
} from "@/lib/state/stationStore";

interface ModeStatusBarProps {
  /** Opens MatchModal — lifted from the town page so the bar shares
   *  the same handler as the Together mode card below. */
  onFindBuddy: () => void;
  /** City-Mode immersive: when the parent BottomHUD collapses, this
   *  status bar collapses with it. Lifted as a prop (not derived via
   *  `useImmersiveFocus` here) so the edge-reveal flag stays the
   *  single source of truth at the BottomHUD level. */
  collapsed?: boolean;
  /** Skips the slide+fade transition when the user has opted out of
   *  motion via `prefers-reduced-motion: reduce`. */
  reduceMotion?: boolean;
}

/**
 * Persistent "you are in CITY MODE" status surface that sits directly
 * above the 3-column BottomHUD. Names the current mode, shows a LIVE
 * pulse driven by the city station's connection state, and exposes
 * shortcut chips to switch out to Solo / Together so the user always
 * sees there are other modes available.
 */
export function ModeStatusBar({
  onFindBuddy,
  collapsed = false,
  reduceMotion = false,
}: ModeStatusBarProps) {
  const t = useTranslations("town.bottom.modeBar");
  const router = useRouter();

  // Number of pilots currently on the street — pulled from the same
  // presence projection the town page already hydrates.
  const pilotCount = usePresenceStore((s) => Object.keys(s.byId).length);

  // City station connection: when the user has explicitly disconnected
  // we soften the indicator from a glowing LIVE pulse to a muted dot.
  // `activeScope` is set at the town-page level (page.tsx) so this
  // selector returns the real value on first paint — no fallback.
  const connection = useStationStore(selectActiveConnection);
  const activeScopeKind = useStationStore((s) => s.activeScope?.kind);
  const isCityLive = activeScopeKind === "city" && connection === "connected";

  return (
    <div
      data-testid="mode-status-bar"
      role="status"
      aria-live="polite"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 168,
        height: 36,
        padding: "0 18px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        background:
          "linear-gradient(180deg, rgba(7,4,26,0.6) 0%, rgba(7,4,26,0.92) 100%)",
        borderTop: "1px solid var(--panel-stroke)",
        borderBottom: "1px dashed var(--panel-stroke)",
        zIndex: 12,
        transition: reduceMotion
          ? "none"
          : "opacity 280ms ease-out, transform 320ms cubic-bezier(0.22,1,0.36,1)",
        opacity: collapsed ? 0 : 1,
        transform: collapsed ? "translateY(12px)" : "translateY(0)",
        pointerEvents: collapsed ? "none" : "auto",
      }}
      className="md:flex hidden"
    >
      {/* Left: CITY MODE · LIVE · N pilots focusing */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          minWidth: 0,
          flex: 1,
        }}
      >
        <span
          aria-hidden
          className={isCityLive ? "animate-blinkSoft" : undefined}
          style={{
            width: 8,
            height: 8,
            background: isCityLive ? "var(--accent)" : "var(--ink-dim)",
            boxShadow: isCityLive ? "var(--neon-glow)" : "none",
            flexShrink: 0,
          }}
        />
        <span
          className="font-silkscreen"
          style={{
            fontSize: 11,
            color: "var(--accent)",
            letterSpacing: "0.28em",
            textShadow: isCityLive ? "var(--neon-glow)" : "none",
            whiteSpace: "nowrap",
          }}
        >
          {t("cityLabel")}
        </span>
        <span
          aria-hidden
          className="font-silkscreen"
          style={{
            fontSize: 9,
            color: "var(--ink-dim)",
            letterSpacing: "0.2em",
          }}
        >
          ·
        </span>
        <span
          className="font-silkscreen"
          data-testid="mode-status-bar-live"
          style={{
            fontSize: 9,
            color: isCityLive ? "var(--accent-2)" : "var(--ink-dim)",
            letterSpacing: "0.22em",
            whiteSpace: "nowrap",
          }}
        >
          {isCityLive ? t("live") : t("offline")}
        </span>
        <span
          aria-hidden
          className="font-silkscreen"
          style={{
            fontSize: 9,
            color: "var(--ink-dim)",
            letterSpacing: "0.2em",
          }}
        >
          ·
        </span>
        <span
          className="font-silkscreen"
          data-testid="mode-status-bar-pilots"
          style={{
            fontSize: 10,
            color: "var(--ink-mute)",
            letterSpacing: "0.12em",
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {t("pilotsFocusing", { count: pilotCount })}
        </span>
      </div>

      {/* Right: → SOLO    → TOGETHER */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          type="button"
          data-testid="mode-status-bar-solo"
          onClick={() => router.push("/focus/solo")}
          aria-label={t("soloExitAria")}
          className="font-silkscreen"
          style={{
            background: "transparent",
            border: "1px solid var(--accent-3)",
            color: "var(--accent-3)",
            fontSize: 10,
            letterSpacing: "0.18em",
            padding: "4px 10px",
            cursor: "pointer",
          }}
        >
          {t("soloExit")}
        </button>
        <button
          type="button"
          data-testid="mode-status-bar-together"
          onClick={onFindBuddy}
          aria-label={t("togetherExitAria")}
          className="font-silkscreen"
          style={{
            background: "transparent",
            border: "1px solid var(--accent-2)",
            color: "var(--accent-2)",
            fontSize: 10,
            letterSpacing: "0.18em",
            padding: "4px 10px",
            cursor: "pointer",
            textShadow: "0 0 6px var(--accent-2)",
          }}
        >
          {t("togetherExit")}
        </button>
      </div>
    </div>
  );
}
