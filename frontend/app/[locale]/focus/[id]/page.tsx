"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { useRouter } from "@/i18n/routing";
import { useAuthStore } from "@/lib/state/authStore";
import { FocusTimer } from "@/components/focus-room/FocusTimer";
import { NotesPanel } from "@/components/focus-room/NotesPanel";
import { SharedNotesPanel } from "@/components/focus-room/SharedNotesPanel";
import { PersonalRadio } from "@/components/audio/PersonalRadio";
import { Airplane } from "@/components/scene/Airplane";

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
  const router = useRouter();
  const { user, hydrate } = useAuthStore();
  const [paired] = useState<boolean>(id !== "solo");
  const t = useTranslations("focus.session");

  useEffect(() => {
    if (!user) void hydrate();
  }, [user, hydrate]);

  return (
    <main
      className="absolute inset-0 flex flex-col overflow-hidden"
      style={{
        background:
          "radial-gradient(ellipse at 50% 35%, #1a0a6e 0%, #09023a 50%, #030111 100%)",
      }}
    >
      <Stars />
      <PixelMoon />
      <Airplane intervalSeconds={26} />
      <Airplane intervalSeconds={34} delaySeconds={-15} topPercent={20} />
      <CitySilhouette />

      <header
        className="bg-[rgba(3,1,17,0.96)] border-b border-border flex items-center justify-between px-3 md:px-5 relative z-10 gap-3"
        style={{ height: 52 }}
      >
        <div
          className="font-pixel tracking-[3px] truncate"
          style={{
            fontSize: "var(--font-size-label)",
            lineHeight: 1.2,
            color: "var(--a2)",
            textShadow: "0 0 10px var(--a1), 0 0 20px var(--a3)",
          }}
        >
          ✦ {paired ? t("paired") : t("solo")}
        </div>
        <button
          onClick={() => router.push("/town")}
          className="pixel-btn tracking-wider shrink-0 touch:min-h-[40px]"
          style={{
            fontSize: "var(--font-size-caption)",
            lineHeight: 1.2,
            padding: "8px 16px",
            background: "transparent",
            color: "var(--muted)",
            borderColor: "var(--border)",
            boxShadow: "none",
            textShadow: "none",
          }}
        >
          {t("exitFullscreen")}
        </button>
      </header>

      {/* Mobile: stack timer on top, notes/chat below as a bottom drawer-like
          fixed-height panel. Tablet+: classic side-by-side with the panel
          pinned to the right. */}
      <div
        className={`flex-1 grid min-h-0 relative z-[3] grid-cols-1 grid-rows-[1fr_240px] md:grid-rows-1 ${paired ? "md:grid-cols-[1fr_380px]" : "md:grid-cols-[1fr_360px]"}`}
      >
        <FocusTimer partnerId={paired ? id : null} />
        <aside
          className="border-t border-border md:border-l md:border-t-0 flex flex-col min-h-0"
          style={{ background: "rgba(5,1,20,0.6)", backdropFilter: "blur(8px)" }}
        >
          {paired && user ? (
            <SharedNotesPanel matchId={id} myUserId={user.id} />
          ) : (
            <NotesPanel />
          )}
        </aside>
      </div>

      {/* Per-user random radio — paired and solo sessions both get
          their own private shuffle of the official catalog. Tablet+
          only because phones already need every vertical pixel for
          the timer + notes split. */}
      <div
        className="absolute z-10 hidden md:block"
        style={{ left: 16, top: 60, width: 244 }}
      >
        <PersonalRadio
          context="focus"
          contextId={paired ? id : "solo"}
        />
      </div>
    </main>
  );
}
