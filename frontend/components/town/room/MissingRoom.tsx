"use client";

import { useTranslations } from "next-intl";

import { useRouter } from "@/i18n/routing";

/**
 * Rendered when the API returns 404 for an unknown room id. Kept dead
 * simple — a single emoji + one-line message — so it can't be mistaken
 * for a permission-denied state. Page 6 R7 (Phase F3): wrapped in
 * pixel-panel chrome to match the rest of /town.
 */
export function MissingRoom() {
  const t = useTranslations("town.room.missing");
  const router = useRouter();
  return (
    <main className="absolute inset-0 grid place-items-center bg-bg">
      <div
        className="pixel-panel text-center"
        style={{ padding: "20px 28px", maxWidth: 320 }}
      >
        <div style={{ fontSize: 32, marginBottom: 10 }}>🚪</div>
        <div
          className="font-silkscreen"
          style={{
            fontSize: 12,
            color: "var(--ink-mute)",
            letterSpacing: "0.15em",
          }}
        >
          {t("title")}
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
