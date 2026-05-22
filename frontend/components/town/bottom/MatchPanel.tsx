"use client";

import { useTranslations } from "next-intl";

import { useRouter } from "@/i18n/routing";
import { useAuthStore } from "@/lib/state/authStore";
import { useImmersiveFocus } from "@/lib/hooks/useImmersiveFocus";
import { usePrefersReducedMotion } from "@/lib/hooks/usePrefersReducedMotion";
import { useMatchStore } from "@/lib/state/matchStore";
import { characterKeyToAvatar } from "@/lib/data/character-to-avatar";
import { PixelSprite } from "@/components/pixel/PixelSprite";
import { ModeCard } from "./ModeCard";

interface MatchPanelProps {
  /** Triggered when the user clicks "Find Buddy". Parent lifts the
   *  modal-open state. */
  onFindBuddy: () => void;
}

/**
 * Center cluster of the BottomHUD — the "switch out of City Mode" pane.
 *
 * Two equal mode cards live here:
 *   - SOLO  → router.push("/focus/solo")
 *   - TOGETHER → onFindBuddy() (opens MatchModal); if a match has been
 *     accepted, the card flips to RESUME pointing at /focus/{matchId}.
 *
 * The bar above (ModeStatusBar) names the surrounding context as
 * "CITY MODE · LIVE · N pilots focusing", so these cards read as the
 * two ways to leave the city for a deeper focus chamber. The bare
 * "Find Buddy / Solo Focus" two-button layout that used to sit here
 * gave no hint that City was itself a mode and that these were the
 * other two.
 */
export function MatchPanel({ onFindBuddy }: MatchPanelProps) {
  const t = useTranslations("town.bottom.modes");
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  // City-Mode immersive: the two cards split-collapse — SOLO slides
  // left-and-down, TOGETHER slides right-and-down. Uses raw inline
  // styles (not Tailwind utilities) so the offsets compose with the
  // BottomHUD's own translateY without class-order surprises.
  const immersive = useImmersiveFocus();
  const reduceMotion = usePrefersReducedMotion();
  const cardTransition = reduceMotion
    ? "none"
    : "opacity 360ms ease-out, transform 420ms cubic-bezier(0.22,1,0.36,1)";
  // ``busy`` covers any non-idle status — modal is already mounted (or
  // pending), so the CTA must lock out re-entry. Replaces the legacy
  // ``proposing`` boolean; the waiting-pool state machine collapses
  // that into the discriminated ``status`` field.
  const matchStatus = useMatchStore((s) => s.status);
  const busy = matchStatus !== "idle";
  const accepted = useMatchStore((s) => s.accepted);
  const avatar = characterKeyToAvatar(user?.character_key);

  const hasAccepted = accepted !== null && accepted.status === "accepted";

  const togetherCta = hasAccepted ? t("together.resumeCta") : t("together.cta");
  const togetherAria = hasAccepted
    ? t("together.resumeAria")
    : t("together.ctaAria");
  const onTogether = hasAccepted
    ? () => router.push(`/focus/${accepted.id}`)
    : onFindBuddy;

  const partnerCharacter = hasAccepted
    ? accepted.requester_id === user?.id
      ? accepted.candidate_character_key
      : accepted.requester_character_key
    : null;
  const partnerAvatar = partnerCharacter
    ? characterKeyToAvatar(partnerCharacter)
    : null;

  return (
    <div
      data-testid="match-panel"
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 8,
        minWidth: 0,
      }}
    >
      <div
        style={{
          transition: cardTransition,
          transitionDelay: reduceMotion ? "0ms" : immersive ? "50ms" : "0ms",
          transform: immersive
            ? "translate(-40px, 120%)"
            : "translate(0, 0)",
          opacity: immersive ? 0 : 1,
          pointerEvents: immersive ? "none" : "auto",
          minWidth: 0,
        }}
      >
      <ModeCard
        testId="mode-card-solo"
        icon="🍅"
        title={t("solo.title")}
        description={t("solo.desc")}
        ctaLabel={t("solo.cta")}
        ctaAriaLabel={t("solo.ctaAria")}
        accentVar="var(--accent-3)"
        onCta={() => router.push("/focus/solo")}
        extra={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <PixelSprite
              sprite={avatar.sprite}
              palette={avatar.palette}
              scale={1.6}
              glow="var(--accent-3)"
            />
            <span
              className="font-silkscreen"
              style={{
                fontSize: 8,
                color: "var(--ink-dim)",
                letterSpacing: "0.18em",
              }}
            >
              {(user?.display_name ?? "PILOT").toUpperCase()}
            </span>
          </div>
        }
      />
      </div>

      <div
        style={{
          transition: cardTransition,
          transitionDelay: reduceMotion ? "0ms" : immersive ? "100ms" : "0ms",
          transform: immersive
            ? "translate(40px, 120%)"
            : "translate(0, 0)",
          opacity: immersive ? 0 : 1,
          pointerEvents: immersive ? "none" : "auto",
          minWidth: 0,
        }}
      >
      <ModeCard
        testId="mode-card-together"
        icon="✦"
        title={t("together.title")}
        description={t("together.desc")}
        ctaLabel={togetherCta}
        ctaAriaLabel={togetherAria}
        accentVar="var(--accent-2)"
        onCta={onTogether}
        disabled={busy && !hasAccepted}
        disabledCursor="wait"
        badge={
          hasAccepted && partnerCharacter
            ? t("together.matchedWith", {
                name: partnerAvatar?.name ?? "buddy",
              })
            : null
        }
        extra={
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <PixelSprite
              sprite={avatar.sprite}
              palette={avatar.palette}
              scale={1.6}
              glow="var(--accent-2)"
            />
            <span
              aria-hidden
              className="font-silkscreen"
              style={{
                fontSize: 12,
                color: "var(--accent-2)",
              }}
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
          </div>
        }
      />
      </div>
    </div>
  );
}
