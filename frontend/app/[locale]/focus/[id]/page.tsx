"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { useAuthStore } from "@/lib/state/authStore";
import { useMatchStore } from "@/lib/state/matchStore";
import { matchesApi } from "@/lib/api/endpoints";
import { findCharacter } from "@/lib/data/characters";
import { SoloFocusScene } from "@/components/focus/SoloFocusScene";
import { BuddyFocusScene } from "@/components/focus-buddy/BuddyFocusScene";

/** Deep-purple pixel city silhouette: calm horizon, no window detail. */
function CitySilhouette() {
  const heights = useMemo(
    () => [54, 88, 42, 102, 70, 122, 60, 96, 78, 138, 82, 108, 64, 92, 116, 74, 100, 68],
    [],
  );
  return (
    <div className="absolute left-0 right-0 bottom-0 flex items-end z-[1] pointer-events-none">
      {heights.map((h, i) => (
        <div
          key={i}
          className="flex-1 mx-px"
          style={{
            height: h,
            background:
              "linear-gradient(to top, rgba(76,29,149,0.8), rgba(124,58,237,0.45))",
            borderTop: "1px solid rgba(167,139,250,0.25)",
            boxShadow: "0 -2px 12px rgba(124,58,237,0.18)",
          }}
        />
      ))}
    </div>
  );
}

function PixelMoon() {
  return (
    <div
      className="absolute z-[1] pointer-events-none animate-moonPulse"
      style={{
        top: "12%",
        right: "10%",
        width: 64,
        height: 64,
        borderRadius: "50%",
        background: "radial-gradient(circle at 33% 28%, #fffbeb, #fef3c7, #fcd34d)",
      }}
    />
  );
}

function Stars() {
  const stars = useMemo(() => {
    const out: { top: number; left: number; size: number; dur: number; delay: number }[] = [];
    let h = 314159;
    for (let i = 0; i < 90; i++) {
      h = (h * 16807) % 2147483647;
      const r1 = h / 2147483647;
      h = (h * 16807) % 2147483647;
      const r2 = h / 2147483647;
      out.push({
        top: r1 * 60,
        left: r2 * 100,
        size: r1 < 0.2 ? 2 : 1,
        dur: 1.5 + r2 * 3.5,
        delay: r1 * 5,
      });
    }
    return out;
  }, []);
  return (
    <div className="absolute inset-0 z-[0] pointer-events-none">
      {stars.map((s, i) => (
        <span
          key={i}
          className="absolute rounded-full bg-white animate-twinkle"
          style={
            {
              width: s.size,
              height: s.size,
              top: `${s.top}%`,
              left: `${s.left}%`,
              ["--d" as string]: `${s.dur}s`,
              ["--dl" as string]: `-${s.delay}s`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

export default function FocusRoomPage() {
  const { id } = useParams<{ id: string }>();
  const { user, hydrate } = useAuthStore();
  const acceptedMatch = useMatchStore((s) => s.accepted);
  const [paired] = useState<boolean>(id !== "solo");
  const [partnerKey, setPartnerKey] = useState<string | null>(null);
  // `t` from focus.session was only used by the old paired-branch UI; the new
  // BuddyFocusScene owns its own i18n namespace.
  useTranslations("focus.session");

  useEffect(() => {
    if (!user) void hydrate();
  }, [user, hydrate]);

  // Resolve the partner's character_key for the pairing header. The
  // happy path reuses the just-accepted match from the in-memory store
  // (no extra request). On reload (or deep-link) the store is empty, so
  // we fetch the match by id; if that 4xx's we silently fall back to a
  // "solo-looking" header — the session itself keeps working.
  useEffect(() => {
    if (!paired || !user) {
      setPartnerKey(null);
      return;
    }
    const derive = (m: { requester_id: string; candidate_id: string; requester_character_key: string | null; candidate_character_key: string | null }) =>
      m.requester_id === user.id ? m.candidate_character_key : m.requester_character_key;

    if (acceptedMatch && acceptedMatch.id === id) {
      setPartnerKey(derive(acceptedMatch));
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const m = await matchesApi.getById(id);
        if (!cancelled) setPartnerKey(derive(m));
      } catch {
        if (!cancelled) setPartnerKey(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [paired, user, id, acceptedMatch]);

  // Solo branch: render the Page 4 SoloFocusScene.
  if (!paired) {
    return <SoloFocusScene />;
  }

  // Paired branch: Page 5's BuddyFocusScene replaces the pre-port JSX.
  // Partner display name resolves from `findCharacter(partnerKey).name`
  // when we have the key; otherwise BuddyFocusScene's "Aria" fallback
  // keeps the room readable.
  const partnerCharacter = findCharacter(partnerKey);
  return (
    <BuddyFocusScene
      matchId={id}
      partnerKey={partnerKey}
      partnerName={partnerCharacter?.name ?? "Aria"}
    />
  );
}
