"use client";

import { useMemo } from "react";
import { NPCS } from "@/lib/data/npcs";
import { findCharacter } from "@/lib/data/characters";

/**
 * Cars driving across the road, one per NPC. Each car shows the owner's
 * name + emoji on a tiny plate so the city feels alive with identifiable
 * online users. Body colors derive from the character roster.
 */
export function CarsLane() {
  const cars = useMemo(
    () =>
      NPCS.map((n, idx) => {
        const ch = findCharacter(n.characterKey);
        return {
          key: n.characterKey,
          name: ch?.name ?? "?",
          emoji: ch?.emoji ?? "👤",
          body: ch?.bodyColor ?? "#2b1054",
          roof: ch?.roofColor ?? "#170729",
          bottom: 2 + (idx % 2) * 18,
          dur: n.speedSec,
          delay: -((idx * 0.6) % n.speedSec),
        };
      }),
    [],
  );

  return (
    <div
      className="absolute left-0 right-0 pointer-events-none z-[5]"
      style={{ bottom: 57, height: 56 }}
      aria-hidden
    >
      {cars.map((c) => (
        <div
          key={c.key}
          className="absolute animate-carDrive"
          style={
            {
              bottom: c.bottom,
              left: 0,
              ["--car-dur" as string]: `${c.dur}s`,
              ["--car-delay" as string]: `${c.delay}s`,
            } as React.CSSProperties
          }
        >
          {/* name plate */}
          <div
            style={{
              position: "absolute",
              bottom: 24,
              left: "50%",
              transform: "translateX(-50%)",
              background: "rgba(3,1,17,0.85)",
              border: `1px solid ${c.body}`,
              padding: "0 4px",
              fontSize: 7,
              color: "var(--a2)",
              borderRadius: 2,
              whiteSpace: "nowrap",
              textShadow: "0 0 3px var(--a1)",
            }}
          >
            {c.emoji} {c.name}
          </div>

          {/* car body — pixel composition */}
          <div className="pixel-edge" style={{ width: 40, position: "relative" }}>
            <div
              style={{
                height: 9,
                borderRadius: "3px 3px 0 0",
                margin: "0 5px",
                background: c.roof,
              }}
            />
            <div
              style={{
                height: 13,
                borderRadius: 2,
                background: c.body,
                position: "relative",
              }}
            >
              {/* windows */}
              <div
                style={{
                  position: "absolute",
                  top: 2,
                  left: 5,
                  width: 10,
                  height: 8,
                  borderRadius: 1,
                  background: "rgba(147,197,253,0.55)",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  top: 2,
                  left: 21,
                  width: 10,
                  height: 8,
                  borderRadius: 1,
                  background: "rgba(147,197,253,0.55)",
                }}
              />
              {/* headlight */}
              <div
                style={{
                  position: "absolute",
                  right: -2,
                  top: 4,
                  width: 3,
                  height: 5,
                  background: "#fed7aa",
                  borderRadius: 1,
                  boxShadow: "0 0 8px #fed7aacc",
                }}
              />
              {/* taillight */}
              <div
                style={{
                  position: "absolute",
                  left: -2,
                  top: 4,
                  width: 3,
                  height: 5,
                  background: "#fca5a5",
                  borderRadius: 1,
                  boxShadow: "0 0 4px #fca5a566",
                }}
              />
            </div>
            <div className="flex justify-between px-1 mt-px">
              <div
                style={{
                  width: 10,
                  height: 6,
                  background: "#111",
                  border: "1px solid #333",
                  borderRadius: 2,
                }}
              />
              <div
                style={{
                  width: 10,
                  height: 6,
                  background: "#111",
                  border: "1px solid #333",
                  borderRadius: 2,
                }}
              />
            </div>
            {/* taillight glow trail */}
            <div
              style={{
                position: "absolute",
                left: -6,
                top: "50%",
                width: 14,
                height: 5,
                background:
                  "radial-gradient(ellipse, rgba(252,165,165,0.55), transparent 70%)",
                transform: "translateY(-50%)",
                borderRadius: "50%",
                filter: "blur(2px)",
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
