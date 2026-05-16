"use client";

import { useTranslations } from "next-intl";

import { useRouter } from "@/i18n/routing";
import { BlinkDot } from "@/components/pixel/BlinkDot";

/**
 * Rendered when the API returns 403. After Phase 5 widened the room read
 * for public visibility, this gate only fires for `invite_only` rooms.
 * Page 6 R7 (Phase F3): switched from the engraved-plaque interior-art
 * style to pixel-panel chrome so the 403 reads as part of the product
 * shell, matching the rest of /town's pixel-UI surfaces.
 */
export function LockedRoom({ roomId }: { roomId: string }) {
  const t = useTranslations("town.room.locked");
  const router = useRouter();
  return (
    <main className="absolute inset-0 grid place-items-center bg-bg">
      <div
        className="pixel-panel text-center"
        style={{ padding: "20px 28px", maxWidth: 360 }}
      >
        <div style={{ fontSize: 32, marginBottom: 10 }}>🔒</div>
        <div
          className="font-silkscreen"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontSize: 11,
            color: "var(--coral)",
            letterSpacing: "0.2em",
          }}
        >
          <BlinkDot color="var(--coral)" />
          {t("badge")}
        </div>
        <div
          className="font-noto-sans-tc"
          style={{
            fontSize: 12,
            color: "var(--ink-mute)",
            lineHeight: 1.6,
            marginTop: 8,
          }}
        >
          {t("subtitle")}
        </div>
        <div
          className="font-silkscreen"
          style={{
            fontSize: 10,
            color: "var(--ink-dim)",
            letterSpacing: "0.1em",
            marginTop: 8,
          }}
        >
          {t("idPrefix")} {roomId.slice(0, 8)}…
        </div>
        <div style={{ marginTop: 16 }}>
          <button
            type="button"
            onClick={() => router.push("/town")}
            className="pixel-btn"
            style={{ padding: "6px 14px", fontSize: 10 }}
          >
            ◀ {t("backLink")}
          </button>
        </div>
      </div>
    </main>
  );
}
