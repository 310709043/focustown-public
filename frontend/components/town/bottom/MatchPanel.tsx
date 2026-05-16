"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { useRouter } from "@/i18n/routing";
import { useAuthStore } from "@/lib/state/authStore";
import { useMatchStore } from "@/lib/state/matchStore";
import { characterKeyToAvatar } from "@/lib/data/character-to-avatar";
import { PixelSprite } from "@/components/pixel/PixelSprite";

type TagKey = "code" | "write" | "study" | "design" | "all";
const TAG_KEYS: ReadonlyArray<TagKey> = ["code", "write", "study", "design", "all"];

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
 * - Tag filter chips: 5 options (#程式 / #寫作 / #學習 / #設計 / #任何).
 *   Local state — the active tag is decorative this PR (future: forward to
 *   `matchesApi.auto` once the backend accepts a tag filter).
 * - Bottom row: "✦ Find Buddy" pink-primary CTA (wires to onFindBuddy) +
 *   "Solo Focus" cyan-outlined button (routes to /focus/solo).
 *
 * SOLID: SRP (one panel concern), DIP (useMatchStore + useAuthStore +
 * useRouter, no direct API calls).
 */
export function MatchPanel({ onFindBuddy }: MatchPanelProps) {
  const t = useTranslations("town.bottom.matchPanel");
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const proposing = useMatchStore((s) => s.proposing);
  const avatar = characterKeyToAvatar(user?.character_key);
  const [tag, setTag] = useState<TagKey>("all");

  return (
    <div
      data-testid="match-panel"
      className="pixel-panel relative"
      style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}
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

      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {TAG_KEYS.map((k) => {
          const active = tag === k;
          return (
            <button
              key={k}
              type="button"
              onClick={() => setTag(k)}
              data-active={active || undefined}
              className="font-silkscreen"
              style={{
                padding: "3px 7px",
                fontSize: 9,
                background: active ? "var(--accent)" : "transparent",
                color: active ? "#0a0524" : "var(--ink-mute)",
                border: `1px solid ${active ? "var(--accent)" : "var(--panel-stroke)"}`,
                letterSpacing: "0.1em",
                cursor: "pointer",
              }}
            >
              #{t(`tags.${k}` as const)}
            </button>
          );
        })}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        <button
          type="button"
          data-testid="match-panel-find-buddy"
          onClick={onFindBuddy}
          disabled={proposing}
          className="pixel-btn primary"
          style={{
            padding: "10px 8px",
            fontSize: 12,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 2,
            opacity: proposing ? 0.6 : 1,
            cursor: proposing ? "wait" : "pointer",
          }}
        >
          <span>✦ {t("findBuddyCta")}</span>
          <span style={{ fontSize: 8, opacity: 0.7 }}>{t("findBuddySub")}</span>
        </button>
        <button
          type="button"
          data-testid="match-panel-solo"
          onClick={() => router.push("/focus/solo")}
          className="pixel-btn"
          style={{
            padding: "10px 8px",
            fontSize: 12,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 2,
            borderColor: "var(--accent-3)",
            color: "var(--accent-3)",
          }}
        >
          <span>{t("soloCta")}</span>
          <span style={{ fontSize: 8, opacity: 0.7 }}>{t("soloSub")}</span>
        </button>
      </div>
    </div>
  );
}
