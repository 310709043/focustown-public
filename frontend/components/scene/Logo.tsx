"use client";

import Image from "next/image";

type Props = {
  scale?: number;
  glow?: boolean;
  className?: string;
};

const BASE_HEIGHT = 40;
// 600 × 467 native — battery-skyline emblem over "Low Battery Town"
// wordmark, pre-trimmed with a transparent background. Earlier the asset
// was a black-backed square faked-transparent via `mixBlendMode: screen`,
// which washed the logo out (often to invisible) over the town's bright
// daytime sky. The trimmed alpha PNG renders correctly on any backdrop.
const ASPECT = 600 / 467;

export function Logo({ scale = 1, glow = true, className }: Props) {
  const height = Math.round(BASE_HEIGHT * scale);
  const width = Math.round(height * ASPECT);
  return (
    <Image
      src="/logo-trimmed.png"
      alt="Low Battery Town"
      width={width}
      height={height}
      priority
      className={className}
      // Width is the cap; height follows aspect ratio so the emblem
      // shrinks proportionally inside narrow containers. `aspectRatio`
      // keeps height correct after CSS scaling without depending on the
      // image to set it.
      style={{
        width,
        height: "auto",
        maxWidth: "100%",
        aspectRatio: `${ASPECT}`,
        filter: glow
          ? "drop-shadow(0 0 6px rgba(233,167,110,0.5))"
          : "none",
      }}
    />
  );
}
