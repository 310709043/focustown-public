"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";

import { useOnboardingStore } from "@/lib/state/onboardingStore";
import { SpotlightOverlay } from "./SpotlightOverlay";
import { CoachBubble } from "./CoachBubble";

/**
 * Sequential per-step config. `targetSelector` is matched against the
 * DOM via `document.querySelector` — null = no spotlight (centered
 * card). `placement` controls where the bubble sits.
 *
 * Step ids correspond to keys under the `onboarding.steps` namespace
 * (welcome / city / solo / together / done).
 */
const STEPS: ReadonlyArray<{
  id: "welcome" | "city" | "solo" | "together" | "done";
  targetSelector: string | null;
  placement: "center" | "bottom";
}> = [
  { id: "welcome", targetSelector: null, placement: "center" },
  // City step spotlights the whole BottomHUD instead of just the
  // ModeStatusBar so the ring still renders on mobile (where
  // ModeStatusBar is `md:flex hidden`). The BottomHUD IS City Mode's
  // controls — timer + match cards + music — so the copy still reads
  // correctly when the spotlight covers the whole console.
  { id: "city", targetSelector: '[data-testid="bottom-hud"]', placement: "bottom" },
  { id: "solo", targetSelector: '[data-testid="mode-card-solo"]', placement: "bottom" },
  {
    id: "together",
    targetSelector: '[data-testid="mode-card-together"]',
    placement: "bottom",
  },
  { id: "done", targetSelector: null, placement: "center" },
];

/** True if any modal backdrop is currently mounted. Used to defer the
 *  tour's auto-fire so we don't dim the screen behind an active modal. */
function isAnyModalOpen(): boolean {
  return document.querySelector('[data-testid$="modal-backdrop"]') !== null;
}

/**
 * First-time onboarding orchestrator. Auto-starts the tour when
 * `completed === false` and the store has been hydrated; thereafter
 * users replay it via the ProfileModal "Replay tutorial" row.
 *
 * Mounts on /town only — this is the only page that has a Mode Status
 * Bar + Mode Cards to point at, which is the whole point of the tour.
 */
export function OnboardingTour() {
  const completed = useOnboardingStore((s) => s.completed);
  const active = useOnboardingStore((s) => s.active);
  const stepIndex = useOnboardingStore((s) => s.currentStep);
  const hasHydrated = useOnboardingStore((s) => s.hasHydrated);
  const start = useOnboardingStore((s) => s.start);
  const next = useOnboardingStore((s) => s.next);
  const back = useOnboardingStore((s) => s.back);
  const skip = useOnboardingStore((s) => s.skip);

  const t = useTranslations("onboarding.steps");

  // Auto-fire on first arrival. Gated on:
  //   1. zustand persist has finished reading localStorage (hasHydrated)
  //      — otherwise a returning user with `completed: true` in storage
  //      sees the welcome bubble flash before rehydration lands.
  //   2. No modal is currently open — if one is, defer the start so the
  //      tour doesn't dim the screen behind it.
  // We wait 600 ms so the BottomHUD has time to mount and the spotlight
  // has something to measure on step 2.
  useEffect(() => {
    if (!hasHydrated || completed || active) return;
    const id = window.setTimeout(() => {
      if (useOnboardingStore.getState().completed) return;
      if (isAnyModalOpen()) return;
      start();
    }, 600);
    return () => window.clearTimeout(id);
  }, [hasHydrated, completed, active, start]);

  // ESC key skips the tour.
  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") skip();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [active, skip]);

  if (!active) return null;

  const step = STEPS[stepIndex] ?? STEPS[0];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === STEPS.length - 1;

  // next-intl typing requires literal keys — fall back via switch so
  // the type-checker can prove every branch returns a valid string.
  const copy = (() => {
    switch (step.id) {
      case "welcome":
        return {
          eyebrow: t("welcome.eyebrow"),
          title: t("welcome.title"),
          body: t("welcome.body"),
        };
      case "city":
        return {
          eyebrow: t("city.eyebrow"),
          title: t("city.title"),
          body: t("city.body"),
        };
      case "solo":
        return {
          eyebrow: t("solo.eyebrow"),
          title: t("solo.title"),
          body: t("solo.body"),
        };
      case "together":
        return {
          eyebrow: t("together.eyebrow"),
          title: t("together.title"),
          body: t("together.body"),
        };
      case "done":
        return {
          eyebrow: t("done.eyebrow"),
          title: t("done.title"),
          body: t("done.body"),
        };
    }
  })();

  return (
    <>
      <SpotlightOverlay targetSelector={step.targetSelector} />
      <CoachBubble
        eyebrow={copy.eyebrow}
        title={copy.title}
        body={copy.body}
        stepIndex={stepIndex}
        isFirst={isFirst}
        isLast={isLast}
        placement={step.placement}
        onSkip={skip}
        onBack={back}
        onNext={next}
      />
    </>
  );
}
