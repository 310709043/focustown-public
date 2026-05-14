"use client";

import { PixelSprite } from "@/components/pixel/PixelSprite";
import { COFFEE, NOTE, STAR, TOMATO, TROPHY } from "@/lib/pixel/sprites/world";

/**
 * Floating venue cards hovering over the skyline (STUDY HALL, NEKO RAMEN,
 * CAFE PIXEL, etc.). Pure decoration — no click handlers, no API. The
 * reference prototype places these at fractional x/y across the cityscape;
 * we follow the same percentages and let the parent's relative container
 * resolve them to pixels.
 *
 * Each card uses `.pixel-panel` shell + a pixel icon + Silkscreen label.
 * `animate-pixelFloat` gives them a subtle 3px Y bob so they feel alive
 * against the slow-moving skyline.
 */

interface Venue {
  label: string;
  icon: typeof TOMATO;
  iconColor?: string;
  x: number; // fractional from left
  y: number; // fractional from top
  delaySeconds?: number;
}

const VENUES: readonly Venue[] = [
  { label: "STUDY HALL", icon: TROPHY, x: 0.18, y: 0.46, delaySeconds: 0 },
  { label: "NEKO RAMEN", icon: TOMATO, x: 0.6, y: 0.42, delaySeconds: 0.6 },
  { label: "CAFE PIXEL", icon: COFFEE, x: 0.08, y: 0.62, delaySeconds: 1.2 },
  { label: "LOFI BAR", icon: NOTE, x: 0.35, y: 0.58, delaySeconds: 0.3 },
  { label: "PIXEL ARCADE", icon: STAR, x: 0.78, y: 0.5, delaySeconds: 0.9 },
  { label: "INK STORE", icon: STAR, x: 0.46, y: 0.7, delaySeconds: 1.5 },
];

export function VenueCards() {
  return (
    <div className="absolute inset-0 pointer-events-none z-[4]" aria-hidden>
      {VENUES.map((v) => (
        <div
          key={v.label}
          className="absolute pixel-panel animate-pixelFloat flex items-center gap-2 px-2.5 py-1"
          style={{
            left: `${v.x * 100}%`,
            top: `${v.y * 100}%`,
            animationDelay: `${v.delaySeconds ?? 0}s`,
            fontSize: 11,
          }}
        >
          <PixelSprite
            sprite={v.icon.sprite}
            palette={v.icon.palette}
            scale={2}
          />
          <span
            className="font-pixel-en"
            style={{
              color: "var(--a2)",
              textShadow: "0 0 6px var(--a3)",
              letterSpacing: 1,
            }}
          >
            {v.label}
          </span>
        </div>
      ))}
    </div>
  );
}
