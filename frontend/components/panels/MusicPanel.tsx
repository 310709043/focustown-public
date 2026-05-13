"use client";

import { useState } from "react";
import { clsx } from "clsx";

const TRACKS = [
  "midnight city — lofi remix",
  "tokyo rain — wontolla",
  "late night drive — idealism",
  "coffee stains — chillhop",
  "stargazing — j'san",
];

export function MusicPanel() {
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [mood, setMood] = useState("lofi");

  return (
    <div className="panel relative overflow-hidden flex flex-col gap-1 px-2.5 py-2 bg-card border border-border rounded">
      <div className="flex items-center justify-between">
        <div className="text-[10px] text-muted">🎵 音樂</div>
        <div className="flex items-end gap-0.5 h-4">
          {Array.from({ length: 14 }).map((_, i) => {
            const h = 3 + Math.random() * 13;
            return (
              <span
                key={i}
                className="w-[3px] rounded-sm bg-gradient-to-t"
                style={{
                  background: "linear-gradient(to top,var(--a3),var(--a2))",
                  height: `${h}px`,
                  opacity: playing ? 1 : 0.3,
                }}
              />
            );
          })}
        </div>
      </div>
      <div className="text-[10px] truncate" style={{ color: "var(--a2)" }}>{TRACKS[idx]}</div>
      <div className="text-[9px] text-muted">♪ {idx + 1}/{TRACKS.length} · lofi radio</div>
      <div className="flex items-center gap-1">
        <button
          className="w-[22px] h-[22px] border border-border rounded-sm text-muted hover:border-accent-1 hover:text-accent-1"
          onClick={() => setIdx((i) => (i - 1 + TRACKS.length) % TRACKS.length)}
        >
          ⏮
        </button>
        <button
          className="w-[22px] h-[22px] border border-accent-1 rounded-sm text-accent-1"
          onClick={() => setPlaying((p) => !p)}
        >
          {playing ? "⏸" : "▶"}
        </button>
        <button
          className="w-[22px] h-[22px] border border-border rounded-sm text-muted hover:border-accent-1 hover:text-accent-1"
          onClick={() => setIdx((i) => (i + 1) % TRACKS.length)}
        >
          ⏭
        </button>
        <input type="range" min="0" max="100" defaultValue="65" className="flex-1" />
      </div>
      <div className="flex gap-1 flex-wrap">
        {["lofi", "jazz", "🌧rain", "🎵 Spotify"].map((m) => (
          <button
            key={m}
            onClick={() => setMood(m)}
            className={clsx(
              "text-[9px] px-1.5 py-0.5 rounded-full border",
              mood === m ? "border-accent-1 text-accent-1" : "border-border text-muted",
            )}
          >
            {m}
          </button>
        ))}
      </div>
    </div>
  );
}
