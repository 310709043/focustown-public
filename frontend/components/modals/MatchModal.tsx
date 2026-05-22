"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { Modal } from "./Modal";
import { useMatchStore } from "@/lib/state/matchStore";
import { currentPeriod } from "@/lib/utils/time-greeting";

/**
 * Single-branch waiting modal driven by ``useMatchStore.status``:
 *
 *  - **waiting**:   pulsing ``?`` avatar + elapsed-seconds counter + CANCEL.
 *  - **accepting**: same visuals (rings still spin); the page-level
 *    effect routes into the focus room as soon as the accept call
 *    completes, so no separate UI is needed.
 *
 * Per product decision (2026-05-22): the user no longer sees a partner
 * preview or chooses Accept / Skip — landing in the focus room is the
 * reveal. The modal is closed implicitly once status flips to ``accepted``
 * (the page's nav effect removes it from the tree).
 */
export function MatchModal() {
  const status = useMatchStore((s) => s.status);
  const waitingSince = useMatchStore((s) => s.waitingSince);
  const cancelling = useMatchStore((s) => s.cancelling);
  const cancelQueue = useMatchStore((s) => s.cancelQueue);

  const open = status === "waiting" || status === "accepting";

  // Live elapsed-seconds counter for the waiting branch. We tick once a
  // second; the React state update is cheap (single integer) and avoids
  // pinning a date string into state every tick.
  const [elapsedSec, setElapsedSec] = useState(0);
  useEffect(() => {
    if (status !== "waiting" || waitingSince == null) {
      setElapsedSec(0);
      return;
    }
    const tick = () => {
      setElapsedSec(
        Math.max(0, Math.floor((Date.now() - waitingSince) / 1000)),
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [status, waitingSince]);

  // Pick the greeting once per mount so the period doesn't churn the
  // header on every re-render. Edge case: a tab that crosses midnight
  // while waiting will keep the previous period's wording — acceptable
  // because the user is actively engaged with this modal and a typical
  // wait completes in <60 s.
  const period = useMemo(() => currentPeriod(), []);
  const greetingT = useTranslations(`match.greeting.${period}`);
  const modalT = useTranslations("match.modal");

  const headerNamespace = greetingT("title");
  const subtitle = greetingT("subtitle");

  if (!open) return null;

  const accentColor = "var(--a2)";

  const onClose = async () => {
    if (status === "waiting") {
      await cancelQueue();
    }
    // status === "accepting" → ignore close; navigation will fire and
    // the modal disappears on its own once status → accepted.
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={headerNamespace}
      accent={accentColor}
      width="min(420px, 92vw)"
      testId="match-modal"
    >
      <div className="flex justify-center mb-3 relative" style={{ height: 110 }}>
        <div
          className="absolute animate-ringRotate"
          style={{
            width: 96,
            height: 96,
            borderRadius: "50%",
            border: "2px dashed var(--a2)",
            opacity: 0.5,
            top: 7,
          }}
        />
        <div
          className="absolute animate-ringRotate"
          style={{
            width: 110,
            height: 110,
            borderRadius: "50%",
            border: "1px dotted var(--a1)",
            opacity: 0.35,
            animationDirection: "reverse",
            animationDuration: "10s",
          }}
        />
        <WaitingAvatar />
      </div>

      <div
        className="text-center mb-1"
        style={{ fontSize: 18, color: "var(--text)", fontWeight: 500 }}
      >
        {modalT("waitingTitle")}
      </div>
      <div
        className="text-center mb-4"
        style={{ fontSize: 12, color: "var(--muted)" }}
      >
        {subtitle}
      </div>
      <div
        className="font-pixel text-center mb-5"
        data-testid="match-waiting-elapsed"
        style={{
          fontSize: 14,
          color: "var(--teal)",
          textShadow: "0 0 10px var(--teal)",
          letterSpacing: 2,
        }}
      >
        {modalT("waitingElapsed", { seconds: elapsedSec })}
      </div>

      <div className="flex gap-3 justify-center flex-wrap">
        <button
          data-testid="match-cancel"
          className="pixel-btn touch:min-h-[48px]"
          style={{
            fontSize: 11,
            padding: "12px 24px",
            letterSpacing: 2,
            background: "transparent",
            color: "var(--muted)",
            borderColor: "var(--dim)",
            boxShadow: "none",
            textShadow: "none",
          }}
          disabled={cancelling || status === "accepting"}
          onClick={async () => {
            await cancelQueue();
          }}
        >
          {cancelling
            ? modalT("cancellingCta")
            : status === "accepting"
              ? modalT("acceptLoadingCta")
              : modalT("cancelCta")}
        </button>
      </div>
    </Modal>
  );
}

function WaitingAvatar() {
  return (
    <div
      className="rounded-lg flex items-center justify-center animate-pulse"
      style={{
        width: 64,
        height: 64,
        fontSize: 38,
        background: "var(--dim)",
        boxShadow: "0 0 24px rgba(167,139,250,0.35)",
        marginTop: 23,
        color: "var(--a2)",
      }}
      data-testid="match-waiting-avatar"
    >
      ?
    </div>
  );
}
