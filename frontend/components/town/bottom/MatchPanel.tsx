"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { useRouter } from "@/i18n/routing";
import { useAuthStore } from "@/lib/state/authStore";
import { useImmersiveFocus } from "@/lib/hooks/useImmersiveFocus";
import { usePrefersReducedMotion } from "@/lib/hooks/usePrefersReducedMotion";
import { useMatchStore } from "@/lib/state/matchStore";
import { characterKeyToAvatar } from "@/lib/data/character-to-avatar";
import { PixelSprite } from "@/components/pixel/PixelSprite";

interface MatchPanelProps {
  onFindBuddy: () => void;
}

/**
 * Center cluster of the BottomHUD — two mode cards side-by-side.
 *
 * The active card is fully lit with its accent colour; the inactive
 * card dims to 35% opacity and acts as a large click target to switch.
 */
export function MatchPanel({ onFindBuddy }: MatchPanelProps) {
  const t = useTranslations("town.bottom.modes");
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const immersive = useImmersiveFocus();
  const reduceMotion = usePrefersReducedMotion();
  const [activeMode, setActiveMode] = useState<"solo" | "together">("solo");

  const matchStatus = useMatchStore((s) => s.status);
  const busy = matchStatus !== "idle";
  const accepted = useMatchStore((s) => s.accepted);
  const avatar = characterKeyToAvatar(user?.character_key);

  const hasAccepted = accepted !== null && accepted.status === "accepted";
  const togetherCta = hasAccepted ? t("together.resumeCta") : t("together.cta");
  const togetherAria = hasAccepted ? t("together.resumeAria") : t("together.ctaAria");
  const onTogether = hasAccepted
    ? () => router.push(`/focus/${accepted.id}`)
    : onFindBuddy;

  const partnerCharacter = hasAccepted
    ? accepted.requester_id === user?.id
      ? accepted.candidate_character_key
      : accepted.requester_character_key
    : null;
  const partnerAvatar = partnerCharacter ? characterKeyToAvatar(partnerCharacter) : null;

  const panelTransition = reduceMotion
    ? "none"
    : "opacity 360ms ease-out, transform 420ms cubic-bezier(0.22,1,0.36,1)";
  const modeTransition = reduceMotion ? "none" : "opacity 250ms ease, box-shadow 250ms ease";

  const isSolo = activeMode === "solo";

  return (
    <div
      data-testid="match-panel"
      className="match-panel-root"
      style={{
        transition: panelTransition,
        opacity: immersive ? 0 : 1,
        transform: immersive ? "translateY(120%)" : "translateY(0)",
        pointerEvents: immersive ? "none" : "auto",
      }}
    >
      {/* ── SOLO card ── */}
      <div
        data-testid="mode-card-solo"
        role="button"
        tabIndex={0}
        aria-pressed={isSolo}
        aria-label={t("solo.ctaAria")}
        onClick={() => isSolo ? router.push("/focus/solo") : setActiveMode("solo")}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (isSolo ? router.push("/focus/solo") : setActiveMode("solo"))}
        className="pixel-panel hud-panel"
        style={{
          cursor: "pointer",
          borderColor: "var(--accent-3)",
          boxShadow: isSolo
            ? "0 0 10px var(--accent-3), 0 0 2px var(--accent-3), inset 0 0 14px rgba(0,0,0,0.5)"
            : "none",
          opacity: isSolo ? 1 : 0.35,
          transition: modeTransition,
          userSelect: "none",
        }}
      >
        {/* Header */}
        <div className="hud-panel-header">
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span aria-hidden style={{ fontSize: 16, lineHeight: 1 }}>🔋</span>
            <span
              className="font-silkscreen"
              style={{
                fontSize: 11,
                color: "var(--accent-3)",
                letterSpacing: "0.18em",
                textShadow: isSolo ? "0 0 8px var(--accent-3)" : "none",
              }}
            >
              {t("solo.title")}
            </span>
          </div>
        </div>

        {/* Avatar row */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <PixelSprite
            sprite={avatar.sprite}
            palette={avatar.palette}
            scale={1.8}
            glow={isSolo ? "var(--accent-3)" : null}
          />
          <span
            className="font-silkscreen"
            style={{
              fontSize: 8,
              color: "var(--ink-dim)",
              letterSpacing: "0.15em",
              maxWidth: 60,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {(user?.display_name ?? "PILOT").toUpperCase()}
          </span>
        </div>

        {/* CTA */}
        <div className="hud-panel-controls">
          <button
            type="button"
            data-testid="mode-card-solo-cta"
            onClick={(e) => { e.stopPropagation(); router.push("/focus/solo"); }}
            aria-label={t("solo.ctaAria")}
            className="pixel-btn touch:min-h-[44px]"
            style={{
              flex: 1,
              padding: "6px 10px",
              fontSize: 10,
              letterSpacing: "0.18em",
              borderColor: "var(--accent-3)",
              color: "var(--accent-3)",
              opacity: isSolo ? 1 : 0,
              pointerEvents: isSolo ? "auto" : "none",
              transition: modeTransition,
              whiteSpace: "nowrap",
            }}
          >
            {t("solo.cta")}
          </button>
        </div>
      </div>

      {/* ── TOGETHER card ── */}
      <div
        data-testid="mode-card-together"
        role="button"
        tabIndex={0}
        aria-pressed={!isSolo}
        aria-label={togetherAria}
        onClick={() => !isSolo ? onTogether() : setActiveMode("together")}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (!isSolo ? onTogether() : setActiveMode("together"))}
        className="pixel-panel hud-panel"
        style={{
          cursor: "pointer",
          borderColor: "var(--accent-2)",
          boxShadow: !isSolo
            ? "0 0 10px var(--accent-2), 0 0 2px var(--accent-2), inset 0 0 14px rgba(0,0,0,0.5)"
            : "none",
          opacity: !isSolo ? 1 : 0.35,
          transition: modeTransition,
          userSelect: "none",
        }}
      >
        {/* Header */}
        <div className="hud-panel-header">
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              aria-hidden
              className="font-silkscreen"
              style={{
                fontSize: 14,
                color: "var(--accent-2)",
                lineHeight: 1,
                textShadow: !isSolo ? "0 0 8px var(--accent-2)" : "none",
              }}
            >
              ✦
            </span>
            <span
              className="font-silkscreen"
              style={{
                fontSize: 11,
                color: "var(--accent-2)",
                letterSpacing: "0.18em",
                textShadow: !isSolo ? "0 0 8px var(--accent-2)" : "none",
              }}
            >
              {t("together.title")}
            </span>
          </div>
          {hasAccepted && partnerAvatar && (
            <span
              className="font-silkscreen"
              style={{
                fontSize: 8,
                color: "var(--accent-2)",
                letterSpacing: "0.12em",
                opacity: 0.8,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {t("together.matchedWith", { name: partnerAvatar.name ?? "buddy" })}
            </span>
          )}
        </div>

        {/* Avatars row */}
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <PixelSprite
            sprite={avatar.sprite}
            palette={avatar.palette}
            scale={1.8}
            glow={!isSolo ? "var(--accent-2)" : null}
          />
          <span
            aria-hidden
            className="font-silkscreen"
            style={{ fontSize: 11, color: "var(--accent-2)", opacity: 0.8 }}
          >
            +
          </span>
          {partnerAvatar ? (
            <PixelSprite
              sprite={partnerAvatar.sprite}
              palette={partnerAvatar.palette}
              scale={1.8}
              glow={!isSolo ? "var(--accent-2)" : null}
            />
          ) : (
            <span
              aria-hidden
              className="animate-blinkSoft"
              style={{
                width: 18,
                height: 18,
                border: "1px dashed var(--accent-2)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 10,
                color: "var(--accent-2)",
                fontFamily: "var(--font-silkscreen), monospace",
                opacity: 0.7,
              }}
            >
              ?
            </span>
          )}
        </div>

        {/* CTA */}
        <div className="hud-panel-controls">
          <button
            type="button"
            data-testid="mode-card-together-cta"
            onClick={(e) => { e.stopPropagation(); onTogether(); }}
            disabled={busy && !hasAccepted}
            aria-label={togetherAria}
            className="pixel-btn touch:min-h-[44px]"
            style={{
              flex: 1,
              padding: "6px 10px",
              fontSize: 10,
              letterSpacing: "0.18em",
              borderColor: "var(--accent-2)",
              color: "var(--accent-2)",
              opacity: !isSolo ? (busy && !hasAccepted ? 0.4 : 1) : 0,
              pointerEvents: !isSolo && !(busy && !hasAccepted) ? "auto" : "none",
              cursor: busy && !hasAccepted ? "wait" : "pointer",
              transition: modeTransition,
              whiteSpace: "nowrap",
            }}
          >
            {togetherCta}
          </button>
        </div>
      </div>
    </div>
  );
}
