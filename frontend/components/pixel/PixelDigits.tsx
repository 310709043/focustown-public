"use client";

import { PixelSprite } from "./PixelSprite";

interface PixelDigitsProps {
  /** Digit / colon glyph string, e.g. "25:00" or "08:42". */
  text: string;
  scale?: number;
  color?: string;
  glow?: string | null;
}

/**
 * 5×7-cell pixel digit font ported from `reference/screen-focus.jsx`.
 * Supports `0-9` and `:`; unknown characters fall back to `0`. Composes
 * via `PixelSprite` so the resulting glyph row caches like any other
 * pixel sprite.
 *
 * Shared between Page 4's `BigTimer` and Page 5's `SharedTimer`; sized
 * at scale 4–8 depending on the context (huge for solo, medium for the
 * paired room HUD slot).
 */
const DIGITS: Readonly<Record<string, readonly string[]>> = {
  "0": ["111", "101", "101", "101", "101", "101", "111"],
  "1": ["010", "110", "010", "010", "010", "010", "111"],
  "2": ["110", "001", "001", "010", "100", "100", "111"],
  "3": ["110", "001", "001", "110", "001", "001", "110"],
  "4": ["101", "101", "101", "111", "001", "001", "001"],
  "5": ["111", "100", "100", "110", "001", "001", "110"],
  "6": ["111", "100", "100", "110", "101", "101", "111"],
  "7": ["111", "001", "001", "010", "010", "100", "100"],
  "8": ["111", "101", "101", "111", "101", "101", "111"],
  "9": ["111", "101", "101", "111", "001", "001", "111"],
  ":": ["000", "010", "010", "000", "010", "010", "000"],
};

export function PixelDigits({
  text,
  scale = 4,
  color = "#fff",
  glow = null,
}: PixelDigitsProps) {
  const glyphs = text.split("").map((c) => DIGITS[c] ?? DIGITS["0"]);
  const rows: string[] = [];
  for (let r = 0; r < 7; r++) {
    let line = "";
    glyphs.forEach((g, i) => {
      line += g[r].replaceAll("1", "B").replaceAll("0", ".");
      // Reference inserts a 1-pixel gap between adjacent glyphs.
      if (i < glyphs.length - 1) line += ".";
    });
    rows.push(line);
  }
  return (
    <PixelSprite
      sprite={rows.join("\n")}
      palette={{ B: color }}
      scale={scale}
      glow={glow}
      title={text}
    />
  );
}
