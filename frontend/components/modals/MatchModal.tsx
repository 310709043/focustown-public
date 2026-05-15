"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { useRouter } from "@/i18n/routing";
import { useMatchStore } from "@/lib/state/matchStore";
import { findCharacter } from "@/lib/data/characters";

const SEGMENTS = 10; // 10 boxes; each represents 10% compatibility

export function MatchModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const current = useMatchStore((s) => s.current);
  const acceptMatch = useMatchStore((s) => s.accept);
  const skipMatch = useMatchStore((s) => s.skip);
  const t = useTranslations("match.modal");
  const tCommon = useTranslations("common.buttons");

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

  // The Match HTTP/WS schema only carries `candidate_id` (a user UUID), not
  // a character_key — so this lookup misses for now. When backend extends
  // Match with `candidate_character_key`, the hit path will start working;
  // until then we render a neutral placeholder.
  const character = findCharacter(current.candidate_id);
  const candidate = {
    emoji: character?.emoji ?? "❓",
    name: character?.name ?? t("candidateAnonymous", { id: current.candidate_id.slice(0, 6) }),
    role: character?.role ?? t("candidatePending"),
    bodyColor: character?.bodyColor ?? "#1a0e2a",
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{
        background: "rgba(1,0,10,0.85)",
        backdropFilter: "blur(10px)",
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.06'/%3E%3C/svg%3E\")",
      }}
    >
      <div
        className="bg-card border-2 border-border2 rounded-lg p-7 relative pixel-edge"
        style={{
          width: "min(420px, 92vw)",
          boxShadow:
            "0 0 40px rgba(124,58,237,0.45), 0 0 90px rgba(124,58,237,0.18)",
        }}
      >
        <button
          onClick={onClose}
          aria-label={tCommon("closeAria")}
          className="absolute top-2 right-2 text-muted hover:text-text active:text-text flex items-center justify-center w-10 h-10 rounded"
          style={{ fontSize: 18 }}
        >
          ✕
        </button>

        <h2
          className="font-pixel text-center mb-5"
          style={{
            fontSize: 12,
            color: "var(--a2)",
            letterSpacing: 3,
            textShadow: "0 0 10px var(--a1), 0 0 22px var(--a3)",
          }}
        >
          {t("title")}
        </h2>

        {/* Avatar with rotating halo */}
        <div className="flex justify-center mb-3 relative">
          <div
            className="absolute animate-ringRotate"
            style={{
              width: 96,
              height: 96,
              borderRadius: "50%",
              border: "2px dashed var(--a2)",
              opacity: 0.5,
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
            onClick={async () => {
              const m = await acceptMatch();
              onClose();
              if (m) router.push(`/focus/${m.id}`);
            }}
          >
            {t("acceptCta")}
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
            onClick={() => void skipMatch()}
          >
            {t("nextCta")}
          </button>
        </div>
      </div>
    </div>
  );
}
