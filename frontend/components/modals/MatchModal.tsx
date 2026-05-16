"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Modal } from "./Modal";
import { useRouter } from "@/i18n/routing";
import { useMatchStore } from "@/lib/state/matchStore";
import { findCharacter } from "@/lib/data/characters";

const SEGMENTS = 10;

export function MatchModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const current = useMatchStore((s) => s.current);
  const acceptMatch = useMatchStore((s) => s.accept);
  const skipMatch = useMatchStore((s) => s.skip);
  const accepting = useMatchStore((s) => s.accepting);
  const skipping = useMatchStore((s) => s.skipping);
  const t = useTranslations("match.modal");

  // Stagger the segment fill so the bar lights up box-by-box.
  const [litCount, setLitCount] = useState(0);
  useEffect(() => {
    if (!open || !current) {
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
  }, [open, current]);

  if (!open || !current) return null;

  // Backend hydrates ``candidate_character_key`` on every match response,
  // so we resolve the character sprite directly. The legacy fallback (look
  // up by candidate_id) is kept as a last resort for old WS payloads.
  const character =
    findCharacter(current.candidate_character_key) ??
    findCharacter(current.candidate_id);
  const candidate = {
    emoji: character?.emoji ?? "❓",
    name: character?.name ?? t("candidateAnonymous", { id: current.candidate_id.slice(0, 6) }),
    role: character?.role ?? t("candidatePending"),
    bodyColor: character?.bodyColor ?? "#1a0e2a",
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("title")}
      accent="var(--a2)"
      width="min(420px, 92vw)"
      testId="match-modal"
    >
      {/* Avatar with rotating halo */}
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
        <div
          className="rounded-lg flex items-center justify-center"
          style={{
            width: 64,
            height: 64,
            fontSize: 38,
            background: candidate.bodyColor,
            boxShadow: "0 0 24px rgba(167,139,250,0.55)",
            marginTop: 23,
          }}
        >
          {candidate.emoji}
        </div>
      </div>

      <div
        className="text-center mb-1"
        style={{ fontSize: 18, color: "var(--text)", fontWeight: 500 }}
      >
        {candidate.name}
      </div>
      <div
        className="text-center mb-4"
        style={{ fontSize: 12, color: "var(--muted)" }}
      >
        {candidate.role} · {t("onlineStatus", { hours: 2 })}
      </div>

      {/* Segmented compatibility bar — wraps to two rows on very narrow
          viewports so the 10 boxes always read at one glance. */}
      <div className="flex flex-col items-center gap-2 mb-4">
        <div className="flex gap-1 flex-wrap justify-center max-w-full">
          {Array.from({ length: SEGMENTS }).map((_, i) => {
            const lit = i < litCount;
            return (
              <span
                key={i}
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

      <div className="flex gap-3 justify-center flex-wrap">
        <button
          className="pixel-btn touch:min-h-[48px]"
          style={{ fontSize: 11, padding: "12px 24px", letterSpacing: 2 }}
          disabled={accepting || skipping}
          onClick={async () => {
            const m = await acceptMatch();
            onClose();
            if (m) router.push(`/focus/${m.id}`);
          }}
        >
          {accepting ? t("acceptLoadingCta") : t("acceptCta")}
        </button>
        <button
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
          disabled={accepting || skipping}
          onClick={() => void skipMatch()}
        >
          {skipping ? t("nextLoadingCta") : t("nextCta")}
        </button>
      </div>
    </Modal>
  );
}
