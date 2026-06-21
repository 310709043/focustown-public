"use client";

import Image from "next/image";
import { useEffect, useLayoutEffect, useState } from "react";
import { useTranslations } from "next-intl";

const SESSION_FLAG = "ft.splash.seen";
/** Total splash ceremony before fade begins. */
const HIDE_DELAY_MS = 2800;
/** Fade-out duration — the overlay opacity transitions over this span. */
const FADE_MS = 600;
const REMOVE_DELAY_MS = HIDE_DELAY_MS + FADE_MS;

// Module-scope flag: once the splash has played in this tab, subsequent
// re-mounts (locale switches) must not flash the overlay again.
let SHOWN_THIS_TAB = false;

/** Boot line timings — each line appears sequentially to create a
 *  "system power-on" narrative before the logo reveal. */
const BOOT_LINES = [
  { key: "init", delay: 0 },
  { key: "freq", delay: 280 },
  { key: "scene", delay: 520 },
  { key: "connect", delay: 800 },
  { key: "ready", delay: 1100 },
] as const;

/** Milliseconds after mount before the logo + bar appear. */
const LOGO_REVEAL_MS = 1400;

/** Boot splash — pixel-art CRT power-on sequence.
 *  Shown once per tab via sessionStorage; fades after ceremony completes. */
export function SplashGate() {
  const t = useTranslations("auth.splash");

  const [visible, setVisible] = useState(true);
  const [hiding, setHiding] = useState(false);
  /** Number of boot lines currently visible (0..BOOT_LINES.length). */
  const [bootStep, setBootStep] = useState(0);
  /** Logo + loading bar visible. */
  const [logoReady, setLogoReady] = useState(false);
  /** Brief flash when transitioning from boot text → logo. */
  const [flash, setFlash] = useState(false);

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const alreadySeen =
      SHOWN_THIS_TAB || window.sessionStorage.getItem(SESSION_FLAG) !== null;
    if (alreadySeen) {
      SHOWN_THIS_TAB = true;
      setVisible(false);
    }
  }, []);

  // Boot sequence timers.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (SHOWN_THIS_TAB) return;

    // Stagger boot lines.
    const bootTimers = BOOT_LINES.map((line, i) =>
      window.setTimeout(() => setBootStep(i + 1), line.delay),
    );

    // Flash + logo reveal.
    const flashTimer = window.setTimeout(() => setFlash(true), LOGO_REVEAL_MS - 80);
    const flashOffTimer = window.setTimeout(() => setFlash(false), LOGO_REVEAL_MS + 100);
    const logoTimer = window.setTimeout(() => setLogoReady(true), LOGO_REVEAL_MS);

    // Begin fade-out.
    const hideTimer = window.setTimeout(() => setHiding(true), HIDE_DELAY_MS);
    const removeTimer = window.setTimeout(() => {
      setVisible(false);
      SHOWN_THIS_TAB = true;
      try {
        window.sessionStorage.setItem(SESSION_FLAG, "1");
      } catch {
        /* private/incognito */
      }
    }, REMOVE_DELAY_MS);

    return () => {
      bootTimers.forEach((id) => window.clearTimeout(id));
      window.clearTimeout(flashTimer);
      window.clearTimeout(flashOffTimer);
      window.clearTimeout(logoTimer);
      window.clearTimeout(hideTimer);
      window.clearTimeout(removeTimer);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      aria-hidden
      data-testid="splash"
      className="splash-gate"
      style={{
        opacity: hiding ? 0 : 1,
        transition: `opacity ${FADE_MS}ms ease`,
        pointerEvents: hiding ? "none" : "auto",
      }}
    >
      {/* CRT scanline sweep */}
      <div className="splash-scanline" />

      {/* Brief white flash on logo reveal */}
      <div
        className="splash-flash"
        style={{ opacity: flash ? 1 : 0 }}
      />

      {/* Boot text lines */}
      <div
        className="splash-boot-log"
        style={{
          opacity: logoReady ? 0 : 1,
          transform: logoReady ? "translateY(-10px)" : "translateY(0)",
          transition: "opacity 300ms ease, transform 300ms ease",
        }}
      >
        {BOOT_LINES.map((line, i) => (
          <div
            key={line.key}
            className="splash-boot-line font-pixel-en"
            style={{
              opacity: bootStep > i ? 1 : 0,
              transform: bootStep > i ? "translateX(0)" : "translateX(-8px)",
              transition: "opacity 200ms ease, transform 200ms ease",
            }}
          >
            <span className="splash-boot-prefix">&gt;</span>
            {" "}
            {t(`boot.${line.key}`)}
            {bootStep > i && <span className="splash-boot-ok">[OK]</span>}
          </div>
        ))}
      </div>

      {/* Logo + charging bar */}
      <div
        className="splash-logo-group"
        style={{
          opacity: logoReady ? 1 : 0,
          transform: logoReady ? "scale(1) translateY(0)" : "scale(0.9) translateY(16px)",
          transition: "opacity 400ms cubic-bezier(0.22,1,0.36,1), transform 400ms cubic-bezier(0.22,1,0.36,1)",
        }}
      >
        <Image
          src="/logo-trimmed.png"
          alt="Low Battery Town"
          width={280}
          height={218}
          priority
          className="splash-logo-img"
        />

        <div className="font-pixel-en splash-tagline">
          {t("chargingMessage")}
        </div>

        <div className="splash-bar-track">
          <div
            className="splash-bar-fill"
            style={{
              animation: logoReady
                ? `splashBarFill ${HIDE_DELAY_MS - LOGO_REVEAL_MS - 200}ms steps(24) forwards`
                : "none",
            }}
          />
          <div className="splash-bar-glow" />
        </div>
      </div>

      <style>{`
        .splash-gate {
          position: fixed;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: var(--bg);
          z-index: 99999;
          overflow: hidden;
        }
        .splash-scanline {
          position: absolute;
          inset: 0;
          background: repeating-linear-gradient(
            0deg,
            transparent 0px,
            transparent 2px,
            rgba(255,255,255,0.015) 2px,
            rgba(255,255,255,0.015) 4px
          );
          pointer-events: none;
          z-index: 2;
        }
        .splash-scanline::after {
          content: '';
          position: absolute;
          left: 0;
          right: 0;
          height: 4px;
          background: rgba(255,255,255,0.06);
          animation: splashScanSweep 2.2s linear infinite;
        }
        @keyframes splashScanSweep {
          from { top: -4px; }
          to   { top: 100%; }
        }
        .splash-flash {
          position: absolute;
          inset: 0;
          background: radial-gradient(ellipse at center, rgba(183,148,246,0.15) 0%, transparent 70%);
          pointer-events: none;
          z-index: 3;
          transition: opacity 120ms ease;
        }
        .splash-boot-log {
          position: absolute;
          display: flex;
          flex-direction: column;
          gap: 6px;
          z-index: 4;
          max-width: 90vw;
        }
        .splash-boot-line {
          font-size: 11px;
          color: var(--accent-2, #2dd4bf);
          letter-spacing: 0.15em;
          white-space: nowrap;
          text-shadow: 0 0 8px rgba(45,212,191,0.5);
        }
        .splash-boot-prefix {
          color: var(--accent, #a78bfa);
          margin-right: 2px;
        }
        .splash-boot-ok {
          color: #6ee7b7;
          margin-left: 8px;
          font-size: 10px;
          opacity: 0.8;
        }
        .splash-logo-group {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 14px;
          z-index: 4;
        }
        .splash-logo-img {
          width: 280px;
          max-width: 90vw;
          height: auto;
          image-rendering: pixelated;
          filter: drop-shadow(0 0 12px var(--a1)) drop-shadow(0 0 28px var(--a3));
          animation: splashLogoPulse 1.6s ease-in-out infinite;
        }
        @keyframes splashLogoPulse {
          0%, 100% { filter: drop-shadow(0 0 12px var(--a1)) drop-shadow(0 0 28px var(--a3)); }
          50%      { filter: drop-shadow(0 0 18px var(--a1)) drop-shadow(0 0 40px var(--a3)) drop-shadow(0 0 60px rgba(183,148,246,0.15)); }
        }
        .splash-tagline {
          color: var(--muted);
          letter-spacing: 0.2em;
          font-size: 12px;
          text-shadow: 0 0 6px rgba(183,148,246,0.3);
        }
        .splash-bar-track {
          position: relative;
          margin-top: 12px;
          width: 220px;
          height: 8px;
          border: 1px solid var(--border2);
          overflow: hidden;
          background: rgba(0,0,0,0.4);
        }
        .splash-bar-fill {
          height: 100%;
          width: 0%;
          background: linear-gradient(90deg, var(--a1), var(--a3));
          box-shadow: 0 0 8px var(--a1), 0 0 16px var(--a3);
          position: relative;
          z-index: 1;
        }
        @keyframes splashBarFill {
          from { width: 0% }
          to   { width: 100% }
        }
        .splash-bar-glow {
          position: absolute;
          top: 0;
          left: 0;
          height: 100%;
          width: 40px;
          background: linear-gradient(90deg, transparent, rgba(183,148,246,0.3), transparent);
          animation: splashBarGlowSweep 1.2s ease-in-out infinite;
        }
        @keyframes splashBarGlowSweep {
          from { transform: translateX(-40px); }
          to   { transform: translateX(220px); }
        }
        @media (prefers-reduced-motion: reduce) {
          .splash-scanline::after,
          .splash-logo-img,
          .splash-bar-glow {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}
