"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Modal } from "./Modal";
import { useRouter } from "@/i18n/routing";
import { useMatchStore } from "@/lib/state/matchStore";
import { findCharacter } from "@/lib/data/characters";

const SEGMENTS = 10;

/**
 * Three-branch modal driven by ``useMatchStore.status``:
 *
 *  - **waiting**: pulsing ``?`` avatar + elapsed-seconds counter + CANCEL.
 *  - **proposed**: partner avatar + compatibility bar + ACCEPT / NEXT.
 *  - **accepting / accepted**: ACCEPT button shows a loading state until
 *    navigation completes.
 *
 * The Modal mount stays stable across branches so the rotating ring/halo
 * animation never blinks out between waiting → proposed. ``open`` is
 * driven by ``status !== "idle"`` (single source of truth), not local
 * component state.
 */
export function MatchModal() {
  const router = useRouter();
  const status = useMatchStore((s) => s.status);
  const current = useMatchStore((s) => s.current);
  const waitingSince = useMatchStore((s) => s.waitingSince);
  const cancelling = useMatchStore((s) => s.cancelling);
  const acceptMatch = useMatchStore((s) => s.accept);
  const skipMatch = useMatchStore((s) => s.skip);
  const cancelQueue = useMatchStore((s) => s.cancelQueue);
  const t = useTranslations("match.modal");

  const open = status !== "idle";

  // Stagger the segment fill so the bar lights up box-by-box.
  const [litCount, setLitCount] = useState(0);
  useEffect(() => {
    if (status !== "proposed" || !current) {
      setLitCount(0);
      return;
    }
    const target = Math.round(current.compatibility / 10);
    let i = 0;
    setLitCount(0);
    const id = setInterval(() => {
      i += 1;
      setLitCount(i);
      if (i >= target) clearInterval(id);
    }, 80);
    return () => clearInterval(id);
  }, [status, current]);

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

  if (!open) return null;

  const accentColor = "var(--a2)";

  // Closing the modal cancels the queue if waiting; for proposed state we
  // just clear current (skip would re-enqueue, which is more intentional —
  // a backdrop-click means "exit this flow," not "show me a different one").
  const onClose = async () => {
    if (status === "waiting" || status === "proposed") {
      await cancelQueue();
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("title")}
      accent={accentColor}
      width="min(420px, 92vw)"
      testId="match-modal"
    >
      {/* Avatar with rotating halo — mounted in every branch so the rings
          keep spinning across waiting → proposed transitions. */}
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
        {status === "waiting" ? (
          <WaitingAvatar />
        ) : (
          <ProposedAvatar
            candidateId={current?.candidate_id ?? ""}
            characterKey={current?.candidate_character_key ?? null}
            fallbackName={t("candidateAnonymous", {
              id: (current?.candidate_id ?? "??").slice(0, 6),
            })}
          />
        )}
      </div>

      {status === "waiting" ? (
        <WaitingBody
          subtitle={t("waitingSubtitle")}
          elapsedLabel={t("waitingElapsed", { seconds: elapsedSec })}
        />
      ) : (
        <ProposedBody
          litCount={litCount}
          current={current}
          t={t}
        />
      )}

      <div className="flex gap-3 justify-center flex-wrap">
        {status === "waiting" ? (
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
            disabled={cancelling}
            onClick={async () => {
              await cancelQueue();
            }}
          >
            {cancelling ? t("cancellingCta") : t("cancelCta")}
          </button>
        ) : (
          <>
            <button
              data-testid="match-accept"
              className="pixel-btn primary touch:min-h-[48px]"
              style={{ fontSize: 11, padding: "12px 24px", letterSpacing: 2 }}
              disabled={status === "accepting"}
              onClick={async () => {
                const m = await acceptMatch();
                if (m) router.push(`/focus/${m.id}`);
              }}
            >
              {status === "accepting" ? t("acceptLoadingCta") : t("acceptCta")}
            </button>
            <button
              data-testid="match-skip"
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
              disabled={status === "accepting"}
              onClick={async () => {
                await skipMatch();
                // skipMatch() re-enters the queue; the modal stays open
                // showing the "waiting" branch until the next pair lands.
              }}
            >
              {t("nextCta")}
            </button>
          </>
        )}
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

function ProposedAvatar({
  candidateId,
  characterKey,
  fallbackName,
}: {
  candidateId: string;
  characterKey: string | null;
  fallbackName: string;
}) {
  const character =
    findCharacter(characterKey) ?? findCharacter(candidateId);
  const emoji = character?.emoji ?? "❓";
  const bodyColor = character?.bodyColor ?? "#1a0e2a";
  return (
    <div
      className="rounded-lg flex items-center justify-center"
      style={{
        width: 64,
        height: 64,
        fontSize: 38,
        background: bodyColor,
        boxShadow: "0 0 24px rgba(167,139,250,0.55)",
        marginTop: 23,
      }}
      data-testid="match-proposed-avatar"
      aria-label={fallbackName}
    >
      {emoji}
    </div>
  );
}

function WaitingBody({
  subtitle,
  elapsedLabel,
}: {
  subtitle: string;
  elapsedLabel: string;
}) {
  const t = useTranslations("match.modal");
  return (
    <>
      <div
        className="text-center mb-1"
        style={{ fontSize: 18, color: "var(--text)", fontWeight: 500 }}
      >
        {t("waitingTitle")}
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
        {elapsedLabel}
      </div>
    </>
  );
}

type Translator = ReturnType<typeof useTranslations>;

function ProposedBody({
  current,
  litCount,
  t,
}: {
  current: ReturnType<typeof useMatchStore.getState>["current"];
  litCount: number;
  t: Translator;
}) {
  if (!current) return null;

  const character =
    findCharacter(current.candidate_character_key) ??
    findCharacter(current.candidate_id);
  const name =
    character?.name ??
    t("candidateAnonymous", { id: current.candidate_id.slice(0, 6) });
  const role = character?.role ?? t("candidatePending");

  return (
    <>
      <div
        className="text-center mb-1"
        style={{ fontSize: 18, color: "var(--text)", fontWeight: 500 }}
      >
        {name}
      </div>
      <div
        className="text-center mb-4"
        style={{ fontSize: 12, color: "var(--muted)" }}
      >
        {role} · {t("onlineStatus", { hours: 2 })}
      </div>

      <div className="flex flex-col items-center gap-2 mb-4">
        <div
          data-testid="compat-bar"
          className="flex gap-1 flex-wrap justify-center max-w-full"
        >
          {Array.from({ length: SEGMENTS }).map((_, i) => {
            const lit = i < litCount;
            return (
              <span
                key={i}
                data-segment={i}
                data-lit={lit || undefined}
                style={{
                  width: 22,
                  height: 14,
                  background: lit
                    ? `linear-gradient(135deg, var(--a3), var(--teal))`
                    : "var(--dim)",
                  border: "1px solid var(--border2)",
                  boxShadow: lit ? "0 0 8px var(--a1)" : "none",
                  transition: "background 0.18s, box-shadow 0.18s",
                }}
              />
            );
          })}
        </div>
        <div
          className="font-pixel"
          style={{
            fontSize: 14,
            color: "var(--teal)",
            textShadow: "0 0 10px var(--teal)",
            letterSpacing: 2,
          }}
        >
          {t("matchPercent", { percent: current.compatibility })}
        </div>
      </div>

      <div
        className="font-body mb-5 px-4 py-3 rounded-md"
        style={{
          fontSize: 13,
          color: "var(--a2)",
          background: "rgba(167,139,250,0.07)",
          border: "1px solid var(--border)",
          lineHeight: 1.7,
        }}
      >
        {current.reason || t("reasonFallback")}
      </div>
    </>
  );
}
