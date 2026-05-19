"use client";

import Image from "next/image";

type Props = {
  scale?: number;
  glow?: boolean;
  className?: string;
};

const BASE_HEIGHT = 40;
// 712 × 284 native — wide "Low Battery Town" wordmark.
const ASPECT = 712 / 284;

export function Logo({ scale = 1, glow = true, className }: Props) {
  const height = Math.round(BASE_HEIGHT * scale);
  const width = Math.round(height * ASPECT);
  return (
    <Image
      src="/logo.png"
      alt="Low Battery Town"
      width={width}
      height={height}
      priority
      className={className}
      style={{
        height,
        width,
        filter: glow
          ? "drop-shadow(0 0 6px var(--a1)) drop-shadow(0 0 12px var(--a3))"
          : "none",
      }}
    />
  );
}
