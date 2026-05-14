"use client";

import Image from "next/image";

type Props = {
  scale?: number;
  glow?: boolean;
  className?: string;
};

const BASE_HEIGHT = 40;

/**
 * FocusTown brand mark. Renders `/logo.png` from the public folder.
 * `scale` multiplies the base 40px height linearly; `glow` toggles the
 * accent drop-shadow halo.
 *
 * Used by the splash hero (`scale=5`), the town navbar (`scale=1.4`), and
 * the character-select header (`scale=1.6`). Public API is preserved
 * across implementation changes so call sites never need to update.
 */
export function Logo({ scale = 1, glow = true, className }: Props) {
  const size = Math.round(BASE_HEIGHT * scale);
  return (
    <Image
      src="/logo.png"
      alt="Focus Town"
      width={size}
      height={size}
      priority
      className={className}
      style={{
        height: size,
        width: "auto",
        filter: glow
          ? "drop-shadow(0 0 6px var(--a1)) drop-shadow(0 0 12px var(--a3))"
          : "none",
      }}
    />
  );
}
