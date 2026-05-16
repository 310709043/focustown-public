"use client";

import { useTranslations } from "next-intl";

import { PixelSprite } from "@/components/pixel/PixelSprite";
import { AVATARS } from "@/lib/pixel/sprites/avatars";

/**
 * The "ONLINE NOW" pixel avatar strip rendered beneath the form.
 * Reference shows the first 7 avatars with staggered `floatY` bobs;
 * here we honor the same 0.16 s delay between slots so the rhythm
 * matches frame-for-frame.
 */
export function AvatarFloatStrip({ count = 7 }: { count?: number }) {
  const t = useTranslations("auth.splash");
  const featured = AVATARS.slice(0, count);
  return (
    <div className="flex flex-col items-center" style={{ gap: 6 }}>
      <div
        className="font-silkscreen"
        style={{
          fontSize: 9,
          color: "var(--ink-dim)",
          letterSpacing: "0.3em",
        }}
      >
        {t("onlineCountLabel", { count: (2847).toLocaleString() })}
      </div>
      <div className="flex" style={{ gap: 10 }}>
        {featured.map((a, i) => (
          <div
            key={a.id}
            className="animate-floatY"
            style={
              {
                ["--float-delay" as string]: `${i * 0.16}s`,
              } as React.CSSProperties
            }
          >
            <PixelSprite
              sprite={a.sprite}
              palette={a.palette}
              scale={1.8}
              glow="rgba(167,139,250,0.4)"
              title={a.name}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
