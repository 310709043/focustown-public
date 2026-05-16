"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { PixelSprite } from "@/components/pixel/PixelSprite";
import { STAR_TINY } from "@/lib/pixel/sprites/props";

type Phase = "typing" | "hold" | "erasing";

/**
 * Typewriter tagline — types out `auth.splash.tagline`, holds for
 * 2.4 s, then erases and repeats. Mirrors reference timings: 60 ms
 * per character on the way in, 30 ms on the way out. The tiny yellow
 * star prefix + cyan caret cursor are part of the visual identity.
 */
export function Tagline() {
  const t = useTranslations("auth.splash");
  const text = t("tagline");
  const [shown, setShown] = useState("");
  const [phase, setPhase] = useState<Phase>("typing");
  const indexRef = useRef(0);

  // Reset whenever the locale (and thus tagline text) changes.
  useEffect(() => {
    indexRef.current = 0;
    setShown("");
    setPhase("typing");
  }, [text]);

  useEffect(() => {
    let intervalId: number | undefined;
    let timeoutId: number | undefined;
    if (phase === "typing") {
      intervalId = window.setInterval(() => {
        indexRef.current += 1;
        setShown(text.slice(0, indexRef.current));
        if (indexRef.current >= text.length) setPhase("hold");
      }, 60);
    } else if (phase === "hold") {
      timeoutId = window.setTimeout(() => setPhase("erasing"), 2400);
    } else if (phase === "erasing") {
      intervalId = window.setInterval(() => {
        indexRef.current = Math.max(0, indexRef.current - 1);
        setShown(text.slice(0, indexRef.current));
        if (indexRef.current === 0) setPhase("typing");
      }, 30);
    }
    return () => {
      if (intervalId !== undefined) window.clearInterval(intervalId);
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [phase, text]);

  return (
    <div
      aria-label={text}
      className="font-silkscreen"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        fontSize: 12,
        color: "var(--ink-mute)",
        letterSpacing: "0.3em",
        minHeight: 18,
      }}
    >
      <PixelSprite
        sprite={STAR_TINY.sprite}
        palette={{ Y: "var(--accent-3)" }}
        scale={2}
      />
      <span style={{ textShadow: "0 0 6px rgba(0,0,0,0.6)" }}>{shown}</span>
      <span
        aria-hidden
        className="animate-caretBlink"
        style={{
          display: "inline-block",
          width: 6,
          height: 12,
          background: "var(--accent-3)",
          boxShadow: "var(--neon-glow-cyan)",
        }}
      />
    </div>
  );
}
