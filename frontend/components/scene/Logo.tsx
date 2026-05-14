"use client";

import Image from "next/image";

type Props = {
  scale?: number;
  glow?: boolean;
  className?: string;
};

const BASE_HEIGHT = 40;

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
