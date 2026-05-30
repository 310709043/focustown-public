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
  /** Triggered when the user clicks "Find Buddy". Parent lifts the
   *  modal-open state. */
  onFindBuddy: () => void;
}

/**
 * Center cluster of the BottomHUD — a single unified mode card with
 * SOLO / TOGETHER tabs at the top to switch between the two modes.
 *
 * Replaces the previous two-card side-by-side layout to save horizontal
 * space and make it clearer that these are alternative modes, not simultaneous.
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

  const isSolo = activeMode === "solo";
  const accentVar = isSolo ? "var(--accent-3)" : "var(--accent-2)";

  const cardTransition = reduceMotion
    ? "none"
    : "opacity 360ms ease-out, transform 420ms cubic-bezier(0.22,1,0.36,1)";

  return (
    <div
      data-testid="match-panel"
      className="match-panel-root"
      style={{
        transition: cardTransition,
        opacity: immersive ? 0 : 1,
        transform: immersive ? "translateY(120%)" : "translateY(0)",
        pointerEvents: immersive ? "none" : "auto",
        minWidth: 0,
      }}
    >
      <div
        data-testid={isSolo ? "mode-card-solo" : "mode-card-together"}
        className="pixel-panel"
        style={{
          position: "relative",
          padding: "8px 10px",
          display: "flex",
          flexDirection: "column",
          gap: 4,
          minWidth: 0,
          borderColor: accentVar,
          boxShadow: `0 0 6px ${accentVar}, inset 0 0 12px rgba(0,0,0,0.4)`,
          transition: reduceMotion ? "none" : "border-color 300ms ease, box-shadow 300ms ease",
        }}
      >
        {/* Mode toggle tabs */}
        <div style={{ display: "flex", gap: 2, marginBottom: 2 }}>
          <button
            type="button"
            onClick={() => setActiveMode("solo")}
            className="pixel-btn font-silkscreen"
            style={{
              flex: 1,
              padding: "3px 4px",
              fontSize: 9,
              letterSpacing: "0.15em",
              borderColor: isSolo ? "var(--accent-3)" : "var(--panel-stroke)",
              color: isSolo ? "var(--accent-3)" : "var(--ink-dim)",
              background: isSolo ? "rgba(0,0,0,0.2)" : "transparent",
            }}
          >
            {t("solo.title")}
          </button>
          <button
            type="button"
            onClick={() => setActiveMode("together")}
            className="pixel-btn font-silkscreen"
            style={{
              flex: 1,
              padding: "3px 4px",
              fontSize: 9,
              letterSpacing: "0.15em",
              borderColor: !isSolo ? "var(--accent-2)" : "var(--panel-stroke)",
              color: !isSolo ? "var(--accent-2)" : "var(--ink-dim)",
              background: !isSolo ? "rgba(0,0,0,0.2)" : "transparent",
            }}
          >
            {t("together.title")}
          </button>
        </div>

        {/* Icon + badge row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            minHeight: 18,
          }}
        >
          <span
            aria-hidden
            className="font-silkscreen"
            style={{
              fontSize: 14,
              color: accentVar,
              textShadow: `0 0 6px ${accentVar}`,
              letterSpacing: "0.1em",
            }}
          >
            {isSolo ? "🍅" : "✦"}
          </span>
          {!isSolo && hasAccepted && partnerAvatar && (
            <span
              className="font-silkscreen"
              style={{
                fontSize: 8,
                color: "var(--ink-dim)",
                letterSpacing: "0.15em",
                maxWidth: 90,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {t("together.matchedWith", { name: partnerAvatar.name ?? "buddy" })}
            </span>
          )}
        </div>

        {/* Description */}
        <div
          className="font-silkscreen"
          style={{
            fontSize: 9,
            color: "var(--ink-mute)",
            letterSpacing: "0.06em",
            lineHeight: 1.4,
            flex: 1,
            minHeight: 24,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {isSolo ? t("solo.desc") : t("together.desc")}
        </div>

        {/* Avatars */}
        <div style={{ minHeight: 22, display: "flex", alignItems: "center", gap: isSolo ? 8 : 6 }}>
          {isSolo ? (
            <>
              <PixelSprite
                sprite={avatar.sprite}
                palette={avatar.palette}
                scale={1.6}
                glow="var(--accent-3)"
              />
              <span
                className="font-silkscreen"
                style={{ fontSize: 8, color: "var(--ink-dim)", letterSpacing: "0.18em" }}
              >
                {(user?.display_name ?? "PILOT").toUpperCase()}
              </span>
            </>
          ) : (
            <>
              <PixelSprite
                sprite={avatar.sprite}
                palette={avatar.palette}
                scale={1.6}
                glow="var(--accent-2)"
              />
              <span
                aria-hidden
                className="font-silkscreen"
                style={{ fontSize: 12, color: "var(--accent-2)" }}
              >
                +
              </span>
              {partnerAvatar ? (
                <PixelSprite
                  sprite={partnerAvatar.sprite}
                  palette={partnerAvatar.palette}
                  scale={1.6}
                  glow="var(--accent-2)"
                />
              ) : (
                <span
                  aria-hidden
                  className="animate-blinkSoft"
                  style={{
                    width: 16,
                    height: 16,
                    border: "1px dashed var(--accent-2)",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 10,
                    color: "var(--accent-2)",
                    fontFamily: "var(--font-silkscreen), monospace",
                  }}
                >
                  ?
                </span>
              )}
            </>
          )}
        </div>

        {/* CTA */}
        <button
          type="button"
          data-testid={`${isSolo ? "mode-card-solo" : "mode-card-together"}-cta`}
          onClick={isSolo ? () => router.push("/focus/solo") : onTogether}
          disabled={!isSolo && busy && !hasAccepted}
          aria-label={isSolo ? t("solo.ctaAria") : togetherAria}
          className="pixel-btn"
          style={{
            marginTop: "auto",
            padding: "6px 8px",
            fontSize: 11,
            letterSpacing: "0.18em",
            borderColor: accentVar,
            color: accentVar,
            opacity: !isSolo && busy && !hasAccepted ? 0.55 : 1,
            cursor: !isSolo && busy && !hasAccepted ? "wait" : "pointer",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {isSolo ? t("solo.cta") : togetherCta}
        </button>
      </div>
    </div>
  );
}
