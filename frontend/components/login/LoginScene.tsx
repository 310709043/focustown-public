"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";

import { BlinkDot } from "@/components/pixel/BlinkDot";
import { PixelSprite } from "@/components/pixel/PixelSprite";
import { PixelWord } from "@/components/pixel/PixelWord";
import { RainOverlay } from "@/components/pixel/RainOverlay";
import { ShootingStars } from "@/components/pixel/ShootingStars";
import { StarField } from "@/components/pixel/StarField";
import { Logo } from "@/components/scene/Logo";
import { MOON } from "@/lib/pixel/sprites/props";

import { AvatarFloatStrip } from "./AvatarFloatStrip";
import { FloatingPixels } from "./FloatingPixels";
import { LoginCitizens } from "./LoginCitizens";
import { NumberRoll } from "./NumberRoll";
import { SkylineLayers } from "./SkylineLayers";
import { Tagline } from "./Tagline";

/** Reference's three theme directions. Default `neon` is the only
 *  direction wired today; `dusk` and `rain` ride along for future
 *  `DirectionSync` work. Forwarded to `SkylineLayers` for palette swap
 *  and gates the full-bleed `RainOverlay`. */
export type LoginDirection = "neon" | "dusk" | "rain";

interface LoginSceneProps {
  /** Form / modal panel rendered above the scene. */
  children: ReactNode;
  /** Hide the hero (logo + wordmark + tagline) when the page is a
   *  secondary auth step like /reset-password. */
  showHero?: boolean;
  /** Show the bottom "ONLINE NOW" avatar strip — only used on the
   *  landing `/` route per reference. */
  showAvatarStrip?: boolean;
  /** Approximate live-citizens number rendered in the top bar. The
   *  number is decorative — reference hard-codes 2847. */
  citizenCount?: number;
  /** Theme direction — drives the skyline palette and the optional
   *  rain overlay. Defaults to `neon` for parity with existing callers. */
  direction?: LoginDirection;
}

/**
 * Shared sky+city+street scene that wraps every auth route. The form
 * panel from `/signin`, `/signup`, `/forgot-password`, `/reset-password`,
 * and `/` slots into `children`, which renders above all of the
 * ambient layers but below the global CRT overlay.
 *
 * Z-order, back to front:
 *   1. radial sky gradient (this element's own background)
 *   2. StarField (full-bleed, twinkle)
 *   3. ShootingStars (occasional meteor streaks)
 *   4. PixelSprite MOON (top-right, gentle bob)
 *   5. SkylineLayers (3 procedural canvases at increasing brightness)
 *   6. ground gradient strip (80 px tall, bottom)
 *   7. LoginCitizens (5 walkers + cat at bottom 20 px)
 *   8. FloatingPixels (4 coffee/note items drifting through middle)
 *   9. Top bar (FT marker + version + citizen count)
 *  10. Hero (logo + wordmark + tagline) — gated by `showHero`
 *  11. Form panel (children)
 *  12. AvatarFloatStrip — gated by `showAvatarStrip`
 */
export function LoginScene({
  children,
  showHero = true,
  showAvatarStrip = false,
  citizenCount = 2847,
  direction = "neon",
}: LoginSceneProps) {
  const t = useTranslations("auth.splash");

  return (
    <main
      className="absolute inset-0 overflow-auto"
      style={{
        background:
          "linear-gradient(180deg, var(--sky-top) 0%, var(--sky-mid) 65%, var(--sky-low) 100%)",
      }}
    >
      {/* Stars + meteors */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        <StarField density={0.0008} />
      </div>
      <ShootingStars />

      {/* Rain — only when the theme direction is `rain`, per reference. */}
      {direction === "rain" ? (
        <RainOverlay color="var(--accent)" />
      ) : null}

      {/* Moon (pixel) — gently floats top-right. */}
      <div
        aria-hidden
        className="animate-floatMoon pointer-events-none"
        style={{
          position: "absolute",
          top: 80,
          right: 100,
          opacity: 0.9,
          zIndex: 2,
        }}
      >
        <PixelSprite
          sprite={MOON.sprite}
          palette={MOON.palette}
          scale={5}
          glow="rgba(252,211,77,0.5)"
        />
      </div>

      {/* Three-layer procedural skyline. */}
      <SkylineLayers direction={direction} />

      {/* Ground strip + faint top edge highlight. */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 80,
          background: "linear-gradient(180deg, var(--bg-1), var(--bg-0))",
          borderTop: "1px solid var(--panel-stroke)",
        }}
      />

      {/* Pedestrians + cat + drifting ambient pixels. */}
      <LoginCitizens />
      <FloatingPixels />

      {/* Top bar with FT marker, version, and live citizens count. */}
      <div
        className="font-silkscreen"
        style={{
          position: "absolute",
          top: 16,
          left: 20,
          right: 20,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          zIndex: 10,
          fontSize: 10,
          color: "var(--ink-mute)",
          letterSpacing: "0.15em",
        }}
      >
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <span style={{ color: "var(--accent)" }}>
            <BlinkDot color="var(--accent)" marginRight={4} /> FT
          </span>
          <span>v1.2.0</span>
          <span>·</span>
          <span style={{ color: "#6ee7b7" }}>
            {t("citizensLabel")} <NumberRoll target={citizenCount} />
          </span>
        </div>
        {/* LocaleSwitcher lives in the global LocaleLayout top-right slot,
            so we leave room for it but don't render a duplicate here. */}
      </div>

      {/* Foreground stack — hero + form + (optional) avatar strip. */}
      <div
        className="relative animate-fadeUp"
        style={{
          zIndex: 5,
          minHeight: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 14,
          padding: "70px 20px 30px",
        }}
      >
        {showHero ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
            }}
          >
            <div className="animate-logoBob">
              <Logo scale={3.75} />
            </div>
            <div className="animate-neonFlicker">
              <PixelWord
                text="FOCUSTOWN"
                scale={4}
                color="var(--accent)"
                glow="var(--accent-2)"
              />
            </div>
            <Tagline />
          </div>
        ) : null}

        {children}

        {showAvatarStrip ? <AvatarFloatStrip count={7} /> : null}
      </div>
    </main>
  );
}

