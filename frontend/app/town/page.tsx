"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/state/authStore";
import { useSceneStore } from "@/lib/state/sceneStore";
import { findCharacter } from "@/lib/data/characters";

import { Sky } from "@/components/scene/Sky";
import { StarsLayer } from "@/components/scene/StarsLayer";
import { Moon } from "@/components/scene/Moon";
import { WeatherBadge } from "@/components/scene/WeatherBadge";
import { TownClock } from "@/components/scene/TownClock";
import { Logo } from "@/components/scene/Logo";
import { Airplane } from "@/components/scene/Airplane";
import { Buildings } from "@/components/scene/Buildings";
import { Billboard } from "@/components/scene/Billboard";
import { Pedestrians } from "@/components/scene/Pedestrians";
import { CarsLane } from "@/components/scene/CarsLane";

import { TimerPanel } from "@/components/panels/TimerPanel";
import { LeaderboardPanel } from "@/components/panels/LeaderboardPanel";
import { MusicPanel } from "@/components/panels/MusicPanel";
import { MatchModal } from "@/components/modals/MatchModal";
import { BigFocusCTA } from "@/components/town/BigFocusCTA";

// MVP placeholder counts for the shop lock badge until /shop API is consumed.
const OWNED_ITEMS = 2;
const TOTAL_ITEMS = 12;

export default function TownPage() {
  const router = useRouter();
  const { user, hydrate, signOut } = useAuthStore();
  const advanceScene = useSceneStore((s) => s.advance);
  const [matchOpen, setMatchOpen] = useState(false);

  useEffect(() => {
    if (!user) void hydrate();
  }, [user, hydrate]);

  useEffect(() => {
    // Auto-rotate scenes every 2 minutes for the demo loop.
    const id = setInterval(advanceScene, 2 * 60_000);
    return () => clearInterval(id);
  }, [advanceScene]);

  const myChar = findCharacter(user?.character_key);

  return (
    <main className="absolute inset-0 flex flex-col overflow-hidden">
      {/* ═══ LAYER 1: thicker navbar ═══ */}
      <nav
        className="bg-[rgba(2,0,12,0.97)] border-b border-border flex items-center justify-between px-5 z-10"
        style={{ height: 56 }}
      >
        <div className="flex items-center gap-3">
          <Logo scale={1.4} />
        </div>
        <div className="flex gap-2 items-center">
          <span
            className="border border-border2 rounded-md px-3 py-2 flex items-center gap-1.5"
            style={{
              background: "rgba(167,139,250,0.08)",
              fontSize: 13,
              color: "var(--a2)",
            }}
          >
            <span style={{ fontSize: 15 }}>{myChar?.emoji ?? "👤"}</span>
            <span className="font-japan">{myChar?.name ?? user?.display_name ?? "..."}</span>
          </span>
          <Link
            href="/awards"
            className="border border-border text-muted font-japan rounded-md px-3 py-2 hover:border-amber hover:text-amber transition-colors"
            style={{ fontSize: 13 }}
          >
            🏆 大賞區
          </Link>
          <Link
            href="/shop"
            className="border border-border text-muted font-japan rounded-md px-3 py-2 hover:border-pink hover:text-pink transition-colors flex items-center gap-1.5"
            style={{ fontSize: 13 }}
          >
            🛒 道具
            <span
              style={{
                fontSize: 10,
                color: "var(--amber)",
                background: "rgba(252,211,77,0.12)",
                border: "1px solid rgba(252,211,77,0.4)",
                padding: "1px 5px",
                borderRadius: 99,
                fontFamily: "VT323, monospace",
                letterSpacing: 0.5,
              }}
            >
              🔓 {OWNED_ITEMS}/{TOTAL_ITEMS}
            </span>
          </Link>
          <button
            className="border border-border text-muted font-japan rounded-md px-3 py-2 hover:border-coral hover:text-coral transition-colors"
            style={{ fontSize: 13 }}
            onClick={() => {
              signOut();
              router.push("/");
            }}
          >
            登出
          </button>
        </div>
      </nav>

      {/* ═══ SCENE ═══ */}
      <div className="flex-1 relative overflow-hidden">
        <Sky />
        <StarsLayer />
        <Moon />

        {/* two airplanes with offset cycles so the sky always has movement */}
        <Airplane intervalSeconds={22} delaySeconds={0} />
        <Airplane intervalSeconds={28} delaySeconds={-14} />

        <WeatherBadge />
        <TownClock />

        {/* LAYER 4: buildings + ground crowd */}
        <Buildings />
        <Pedestrians />
        <CarsLane />

        {/* LAYER 3: central billboard */}
        <Billboard />

        {/* LAYER 5: massive focus CTA */}
        <BigFocusCTA />
      </div>

      {/* ═══ LAYER 2: bottom panels (compressed to give BigFocusCTA room) ═══ */}
      <section
        className="grid grid-cols-3 gap-2 p-2 bg-[rgba(2,0,12,0.98)] border-t border-border"
        style={{ height: 156 }}
      >
        <TimerPanel />
        <LeaderboardPanel onMatchClick={() => setMatchOpen(true)} />
        <MusicPanel />
      </section>

      <MatchModal open={matchOpen} onClose={() => setMatchOpen(false)} />
    </main>
  );
}
