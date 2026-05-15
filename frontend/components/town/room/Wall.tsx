"use client";

/**
 * Back wall of the room interior. The 48-pixel pinstripe is what breaks
 * the flat scene gradient and makes the wall read as a surface rather
 * than a void. The top-left plaque mirrors the street's WeatherBadge
 * typography so the two worlds feel like the same town.
 */
export function Wall({ sky, label }: { sky: string; label: string }) {
  return (
    <div
      className="absolute inset-0 animate-themeCrossfade"
      style={{
        background: sky,
        backgroundImage: `${sky}, repeating-linear-gradient(90deg, transparent 0 47px, rgba(167,139,250,0.05) 47px 48px)`,
        backgroundBlendMode: "normal",
      }}
    >
      <div
        className="absolute font-mono"
        style={{
          top: 16,
          left: 24,
          fontSize: 12,
          color: "var(--muted)",
          letterSpacing: 1.5,
          padding: "4px 8px",
          border: "1px solid var(--border)",
          background: "rgba(8,3,25,0.55)",
        }}
      >
        {label}
      </div>
    </div>
  );
}
