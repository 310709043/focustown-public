"use client";

import { useTranslations } from "next-intl";

import { Link } from "@/i18n/routing";

/**
 * Rendered when the API returns 403. After Phase 5 widened the room read
 * for public visibility, this gate only fires for `invite_only` rooms.
 * The engraved plaque visual language matches OwnerPlaque so the gate
 * feels native to the world.
 */
export function LockedRoom({ roomId }: { roomId: string }) {
  const t = useTranslations("town.room.locked");
  return (
    <main className="absolute inset-0 grid place-items-center bg-bg">
      <div
        className="text-center font-japan animate-plaqueFlicker"
        style={{
          padding: "18px 26px 16px",
          background:
            "linear-gradient(180deg, rgba(34,17,42,0.95), rgba(20,9,30,0.95))",
          boxShadow: [
            "0 0 0 1px #b97f3a inset",
            "0 0 0 3px #1a0e22 inset",
            "0 2px 0 0 #b97f3a",
          ].join(", "),
          color: "#ffd9a8",
        }}
      >
        <div style={{ fontSize: 28, marginBottom: 8 }}>🔒</div>
        <div
          className="font-pixel"
          style={{ fontSize: 12, letterSpacing: 1.5, marginBottom: 6 }}
        >
          {t("badge")}
        </div>
        <div
          className="font-mono text-muted"
          style={{ fontSize: 12, letterSpacing: 0.8 }}
        >
          {t("subtitle")}
        </div>
        <div
          className="font-mono text-muted"
          style={{ fontSize: 10, marginTop: 6, opacity: 0.6 }}
        >
          {t("idPrefix")} {roomId.slice(0, 8)}…
        </div>
        <div style={{ marginTop: 14 }}>
          <Link
            href="/town"
            className="font-japan text-amber hover:text-text transition-colors"
            style={{ fontSize: 12 }}
          >
            {t("backLink")}
          </Link>
        </div>
      </div>
    </main>
  );
}
