"use client";

import { useTranslations } from "next-intl";

import { useRouter } from "@/i18n/routing";
import { useAuthStore } from "@/lib/state/authStore";
import { useMatchStore } from "@/lib/state/matchStore";
import { characterKeyToAvatar } from "@/lib/data/character-to-avatar";
import { PixelSprite } from "@/components/pixel/PixelSprite";

interface MatchPanelProps {
  /** Triggered when the user clicks "Find Buddy". Parent lifts the
   *  modal-open state. */
  onFindBuddy: () => void;
}

/**
 * Center cluster of the BottomHUD — the "Find Buddy" pane.
 *
 * - Header: blink dot + FIND BUDDY label + right "~8s avg wait" hint.
 * - Slot row: self avatar (accent glow) + `+` glyph + dashed `?` placeholder
 *   for the to-be-matched candidate + caption.
 * - Bottom row: "✦ Find Buddy" pink-primary CTA (wires to onFindBuddy) +
 *   "Solo Focus" cyan-outlined button (routes to /focus/solo).
 *
 * The 5 tag-filter chips were dropped 2026-05-20 — they were decorative
 * (no backend filter param) and consumed vertical space that pushed the
 * BottomHUD past the street band.
 */
export function MatchPanel({ onFindBuddy }: MatchPanelProps) {
  const t = useTranslations("town.bottom.matchPanel");
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const proposing = useMatchStore((s) => s.proposing);
  const avatar = characterKeyToAvatar(user?.character_key);

  return (
    <div
      data-testid="match-panel"
      className="pixel-panel relative"
      style={{
        padding: 10,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        minWidth: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div
          className="font-silkscreen"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontSize: 10,
            color: "var(--accent-2)",
            letterSpacing: "0.2em",
          }}
        >
          <span
            aria-hidden
            className="animate-blinkSoft"
            style={{
              width: 8,
              height: 8,
              background: "var(--accent-2)",
              boxShadow: "var(--neon-glow-pink)",
            }}
          />
          {t("header")}
        </div>
        <span
          className="font-silkscreen"
          style={{ fontSize: 9, color: "var(--ink-dim)", letterSpacing: "0.1em" }}
        >
          {t("waitTime")}
        </span>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "4px 0" }}>
        <PixelSprite
          sprite={avatar.sprite}
          palette={avatar.palette}
          scale={2.6}
          glow="var(--accent)"
        />
        <span
          className="font-silkscreen"
          style={{ fontSize: 18, color: "var(--accent-2)" }}
        >
          +
        </span>
        <div
          aria-hidden
          className="animate-blinkSoft"
          style={{
            width: 40,
            height: 40,
            border: "2px dashed var(--accent-2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 22,
            color: "var(--accent-2)",
            fontFamily: "var(--font-silkscreen), monospace",
          }}
        >
          ?
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
          <span
            className="font-silkscreen"
            style={{ fontSize: 10, color: "var(--ink)", letterSpacing: "0.1em" }}
          >
            {t("slotCaption")}
          </span>
          <span
            className="font-silkscreen"
            style={{ fontSize: 8, color: "var(--ink-dim)", letterSpacing: "0.15em" }}
          >
            {t("candidateMeta")}
          </span>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 6,
          minWidth: 0,
        }}
      >
        <button
          type="button"
          data-testid="match-panel-find-buddy"
          onClick={onFindBuddy}
          disabled={proposing}
          title={t("findBuddySub")}
          className="pixel-btn primary"
          style={{
            padding: "10px 8px",
            fontSize: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: proposing ? 0.6 : 1,
            cursor: proposing ? "wait" : "pointer",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          ✦ {t("findBuddyCta")}
        </button>
        <button
          type="button"
          data-testid="match-panel-solo"
          onClick={() => router.push("/focus/solo")}
          title={t("soloSub")}
          className="pixel-btn"
          style={{
            padding: "10px 8px",
            fontSize: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderColor: "var(--accent-3)",
            color: "var(--accent-3)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {t("soloCta")}
        </button>
      </div>
    </div>
  );
}
