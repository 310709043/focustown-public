"use client";

import { useMemo } from "react";
import { useSceneStore } from "@/lib/state/sceneStore";

/**
 * Pixel skyline. Buildings sit on the ground line and react to the current
 * scene: window-lit ratio, window tint, and "wet" overlay all change.
 *
 * Layout is deterministic per session (seeded by component-mount memo), so
 * windows don't reshuffle on every re-render — only on scene change via
 * the scene-derived computed style.
 */

type Building = {
  height: number;          // px
  width: number;           // px
  sign?: string;
  signColor?: string;
  hasAc?: boolean;
};

const BUILDINGS: Building[] = [
  { height: 138, width: 42, sign: "CAFE",  signColor: "var(--pink)",   hasAc: true },
  { height: 92,  width: 30 },
  { height: 166, width: 46, sign: "HOTEL", signColor: "var(--amber)",  hasAc: true },
  { height: 112, width: 34, hasAc: true },
  { height: 188, width: 54, sign: "NEON",  signColor: "var(--teal)",   hasAc: true },
  { height: 102, width: 32 },
  { height: 150, width: 44, sign: "CODE",  signColor: "var(--blue)",   hasAc: true },
  { height: 84,  width: 28 },
  { height: 172, width: 50, sign: "STORE", signColor: "var(--coral)",  hasAc: true },
  { height: 124, width: 38, hasAc: true },
  { height: 96,  width: 32 },
  { height: 158, width: 46, sign: "PIXEL", signColor: "var(--pink)",   hasAc: true },
  { height: 78,  width: 26 },
  { height: 142, width: 42, hasAc: true },
  { height: 108, width: 34, sign: "INK",   signColor: "var(--amber)" },
  { height: 168, width: 48, sign: "STUDY", signColor: "var(--teal)",   hasAc: true },
  { height: 88,  width: 30 },
  { height: 130, width: 40, hasAc: true },
  { height: 118, width: 36, sign: "JAZZ",  signColor: "var(--blue)",   hasAc: true },
  { height: 96,  width: 30 },
  { height: 152, width: 44, sign: "RAMEN", signColor: "var(--coral)",  hasAc: true },
  { height: 82,  width: 28 },
  { height: 144, width: 42, sign: "MOON",  signColor: "var(--a2)",     hasAc: true },
  { height: 106, width: 34 },
  { height: 162, width: 48, sign: "PUB",   signColor: "var(--amber)",  hasAc: true },
  { height: 90,  width: 30 },
  { height: 134, width: 40, hasAc: true },
  { height: 152, width: 46, sign: "CAFE",  signColor: "var(--pink)",   hasAc: true },
];

// Parallax back row: dim silhouettes sitting deeper into the scene. Taller
// average height but darker tint + lower opacity sells the depth.
const BUILDINGS_BACK: Pick<Building, "height" | "width">[] = [
  { height: 116, width: 56 },
  { height: 188, width: 70 },
  { height: 142, width: 52 },
  { height: 204, width: 80 },
  { height: 134, width: 50 },
  { height: 168, width: 64 },
  { height: 124, width: 48 },
  { height: 196, width: 74 },
  { height: 156, width: 58 },
  { height: 128, width: 54 },
  { height: 178, width: 66 },
  { height: 138, width: 52 },
];

const SCENE_BACKGROUND: Record<string, [string, string, string]> = {
  night: ["#060118", "#08021e", "#0b0326"],
  dawn:  ["#1a0820", "#220c28", "#2a1030"],
  day:   ["#5b6478", "#6a7488", "#788298"],
  dusk:  ["#2a0c1a", "#380e22", "#42102a"],
  rain:  ["#080a16", "#0a0c1c", "#0c0e22"],
  snow:  ["#1a1a2e", "#202036", "#262640"],
  storm: ["#040408", "#06060e", "#080812"],
};

const SCENE_LIT_RATIO: Record<string, number> = {
  night: 0.62,
  dawn:  0.34,
  day:   0.08,
  dusk:  0.46,
  rain:  0.5,
  snow:  0.55,
  storm: 0.2,
};

const SCENE_WINDOW_COLORS: Record<string, string[]> = {
  night: ["#fcd34d", "#f472b6", "#a78bfa", "#34d399", "#60a5fa", "#fb923c"],
  dawn:  ["#fcd34d", "#fb923c", "#f472b6"],
  day:   ["#60a5fa", "#a78bfa"],
  dusk:  ["#fcd34d", "#fb923c", "#f472b6", "#fb7185"],
  rain:  ["#74b9ff", "#a78bfa", "#fcd34d"],
  snow:  ["#fcd34d", "#74b9ff", "#f472b6"],
  storm: ["#a78bfa", "#74b9ff"],
};

function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function Buildings() {
  const scene = useSceneStore((s) => s.current);
  const bgColors = SCENE_BACKGROUND[scene] ?? SCENE_BACKGROUND.night;
  const litRatio = SCENE_LIT_RATIO[scene] ?? 0.5;
  const winColors = SCENE_WINDOW_COLORS[scene] ?? SCENE_WINDOW_COLORS.night;
  const isWet = scene === "rain" || scene === "storm";
  const hasSnowCap = scene === "snow";

  // Pre-compute per-building per-window lit states. Deterministic by index so
  // SSR + hydration agree and re-renders on scene change re-evaluate.
  const layout = useMemo(() => {
    return BUILDINGS.map((b, idx) => {
      const rows = Math.max(1, Math.floor((b.height - 22) / 16));
      const cols = Math.max(1, Math.floor((b.width - 8) / 11));
      const windows: { lit: boolean; color: string; blink: number }[] = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const seed = hashSeed(`${idx}-${r}-${c}-${scene}`);
          const lit = (seed % 1000) / 1000 < litRatio;
          const color = winColors[seed % winColors.length];
          const blink = 3 + (seed % 7); // 3-9 s blink cycle
          windows.push({ lit, color, blink });
        }
      }
      return { ...b, rows, cols, windows };
    });
  }, [scene, litRatio, winColors]);

  return (
    <>
      {/* parallax back row — silhouettes, lower opacity, no signs */}
      <div
        className="absolute left-0 right-0 flex items-end justify-around px-4 z-[2] pointer-events-none"
        style={{ bottom: 156, opacity: 0.6 }}
        aria-hidden
      >
        {BUILDINGS_BACK.map((b, i) => {
          const bg = bgColors[i % 3];
          return (
            <div
              key={`back-${i}`}
              className="relative shrink-0 pixel-edge"
              style={{
                height: b.height,
                width: b.width,
                background: bg,
                filter: "brightness(0.55) saturate(0.7) blur(0.4px)",
                borderTop: `1px solid ${bgColors[(i + 1) % 3]}`,
                transition: "background 4s",
              }}
            >
              {/* a few dim windows so the silhouette doesn't look dead */}
              {Array.from({ length: Math.floor(b.height / 18) }).map((_, r) => (
                <span
                  key={r}
                  style={{
                    position: "absolute",
                    top: 14 + r * 18,
                    left: "50%",
                    transform: "translateX(-50%)",
                    width: 4,
                    height: 5,
                    background:
                      r % 3 === 0 ? winColors[(i + r) % winColors.length] : "transparent",
                    opacity: r % 3 === 0 ? 0.35 : 0,
                    boxShadow:
                      r % 3 === 0
                        ? `0 0 3px ${winColors[(i + r) % winColors.length]}`
                        : "none",
                  }}
                />
              ))}
            </div>
          );
        })}
      </div>

      {/* front row — full detail */}
      <div
        className="absolute left-0 right-0 flex items-end justify-around px-1.5 z-[3] pointer-events-none"
        style={{ bottom: 156 }}
      >
        {layout.map((b, i) => (
        <div
          key={i}
          className="relative shrink-0 mx-[2px] pixel-edge"
          style={{
            height: b.height,
            width: b.width,
            background: bgColors[i % 3],
            borderTop: `1px solid ${bgColors[(i + 1) % 3]}`,
            transition: "background 4s, border-top-color 4s",
          }}
        >
          {/* snow cap */}
          {hasSnowCap ? (
            <div
              style={{
                position: "absolute",
                top: -3,
                left: 0,
                right: 0,
                height: 3,
                background: "#e8f4ff",
                borderRadius: "2px 2px 0 0",
                opacity: 0.85,
                boxShadow: "0 0 4px rgba(255,255,255,0.5)",
              }}
            />
          ) : null}

          {/* wet overlay */}
          {isWet ? (
            <div
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                height: "30%",
                background:
                  "linear-gradient(to top, rgba(150,180,230,0.18), transparent)",
              }}
            />
          ) : null}

          {/* antenna with red blink */}
          {i % 3 === 0 ? (
            <div
              style={{
                position: "absolute",
                right: 6 + (i % 4),
                top: -12,
                width: 2,
                height: 12,
                background: "#2a1e4a",
              }}
            >
              <div
                className="animate-windowBlink"
                style={
                  {
                    position: "absolute",
                    top: -3,
                    left: -2,
                    width: 4,
                    height: 3,
                    background: "#ff3333",
                    boxShadow: "0 0 6px #ff3333",
                    borderRadius: "50%",
                    ["--wb-dur" as string]: `${2 + (i % 3)}s`,
                  } as React.CSSProperties
                }
              />
            </div>
          ) : null}

          {/* windows grid */}
          {b.windows.map((w, idx) => {
            const r = Math.floor(idx / b.cols);
            const c = idx % b.cols;
            return (
              <span
                key={idx}
                className={w.lit ? "animate-windowBlink" : ""}
                style={
                  {
                    position: "absolute",
                    top: 12 + r * 16,
                    left: 4 + c * 11,
                    width: 6,
                    height: 8,
                    background: w.lit ? w.color : "transparent",
                    boxShadow: w.lit ? `0 0 4px ${w.color}aa` : "none",
                    opacity: w.lit ? 0.75 : 0.22,
                    border: w.lit ? "none" : "1px solid #100428",
                    ["--wb-dur" as string]: `${w.blink}s`,
                    ["--wb-delay" as string]: `${(idx % 9) * 0.4}s`,
                  } as React.CSSProperties
                }
              />
            );
          })}

          {/* AC units */}
          {b.hasAc
            ? [0, 1].map((k) => (
                <div
                  key={k}
                  style={{
                    position: "absolute",
                    width: 5,
                    height: 4,
                    background: "#1a1530",
                    border: "1px solid #2a2545",
                    borderRadius: 1,
                    top: 20 + k * 40,
                    [k % 2 ? "right" : "left"]: -3,
                  }}
                />
              ))
            : null}

          {/* sign */}
          {b.sign ? (
            <div
              className="font-pixel"
              style={{
                position: "absolute",
                top: -13,
                left: "50%",
                transform: "translateX(-50%)",
                fontSize: 6,
                padding: "2px 4px",
                background: "rgba(8,3,25,.92)",
                color: b.signColor ?? "var(--amber)",
                border: `1px solid ${b.signColor ?? "var(--amber)"}55`,
                borderRadius: 2,
                whiteSpace: "nowrap",
                textShadow: `0 0 8px ${b.signColor ?? "var(--amber)"}`,
              }}
            >
              {b.sign}
            </div>
          ) : null}
        </div>
      ))}
      </div>
    </>
  );
}
