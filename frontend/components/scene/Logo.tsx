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
      // Width is the cap; height follows aspect ratio so the wordmark
      // shrinks proportionally inside narrow containers (e.g. splash hero
      // at scale=3.6 on a 375 px phone — intrinsic 361 px wide would
      // otherwise overflow). `aspectRatio` keeps height correct after
      // CSS scaling without depending on the image to set it.
      style={{
        width,
        height: "auto",
        maxWidth: "100%",
        aspectRatio: `${ASPECT}`,
        // screen blend mode removes the black background of the PNG,
        // leaving only the coloured pixel art visible against the dark bg.
        mixBlendMode: "screen",
        filter: glow
          ? "drop-shadow(0 0 6px rgba(233,167,110,0.5))"
          : "none",
      }}
    />
  );
}
