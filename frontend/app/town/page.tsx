"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/state/authStore";
import { useSceneStore, SCENE_ORDER } from "@/lib/state/sceneStore";
import { useMatchStore } from "@/lib/state/matchStore";
import { findCharacter } from "@/lib/data/characters";
import { Sky } from "@/components/scene/Sky";
import { StarsLayer } from "@/components/scene/StarsLayer";
import { Moon } from "@/components/scene/Moon";
import { WeatherBadge } from "@/components/scene/WeatherBadge";
import { TownClock } from "@/components/scene/TownClock";
import { TimerPanel } from "@/components/panels/TimerPanel";
import { LeaderboardPanel } from "@/components/panels/LeaderboardPanel";
import { MusicPanel } from "@/components/panels/MusicPanel";
import { MatchModal } from "@/components/modals/MatchModal";

export default function TownPage() {
  const router = useRouter();
  const { user, hydrate, signOut } = useAuthStore();
  const advanceScene = useSceneStore((s) => s.advance);
  const proposeMatch = useMatchStore((s) => s.propose);
  const [matchOpen, setMatchOpen] = useState(false);

  useEffect(() => {
    if (!user) void hydrate();
  }, [user, hydrate]);

  useEffect(() => {
    // Auto-rotate scenes every 2 minutes (MVP: short cycle for demo)
    const id = setInterval(advanceScene, 2 * 60_000);
    return () => clearInterval(id);
  }, [advanceScene]);

  const myChar = findCharacter(user?.character_key);

  const onMatch = async () => {
    // MVP: pick a random partner_id placeholder — backend matching requires a
    // real candidate. In v2 the leaderboard returns user_ids, and the user
    // picks from there. For now, just open the modal so the UX is visible.
    setMatchOpen(true);
  };

  return (
    <main className="absolute inset-0 flex flex-col overflow-hidden">
      <nav className="h-10 bg-[rgba(2,0,12,.97)] border-b border-border flex items-center justify-between px-3 z-10">
        <div
          className="font-pixel text-[8px] tracking-wider"
          style={{ color: "var(--a2)", textShadow: "0 0 8px var(--a1)" }}
        >
          ✦ FOCUS TOWN
        </div>
        <div className="flex gap-1 items-center">
          <button
            className="border border-border text-muted font-japan text-[10px] px-2.5 py-1 rounded hover:border-accent-1 hover:text-accent-1"
            onClick={onMatch}
          >
            配對 <span className="inline-block w-1.5 h-1.5 rounded-full bg-coral ml-1" />
          </button>
          <span className="border border-border text-muted font-japan text-[10px] px-2.5 py-1 rounded">
            {myChar ? `${myChar.emoji} ${myChar.name}` : user?.display_name ?? "..."}
          </span>
          <Link
            href="/awards"
            className="border border-border text-muted font-japan text-[10px] px-2.5 py-1 rounded hover:border-accent-1 hover:text-accent-1"
          >
            🏆 大賞區
          </Link>
          <Link
            href="/shop"
            className="border border-border text-muted font-japan text-[10px] px-2.5 py-1 rounded hover:border-accent-1 hover:text-accent-1"
          >
            🛒 道具商店
          </Link>
          <button
            className="border border-border text-muted font-japan text-[10px] px-2.5 py-1 rounded hover:border-accent-1 hover:text-accent-1"
            onClick={() => router.push("/focus/solo")}
          >
            🍅 專注
          </button>
          <button
            className="border border-border text-muted font-japan text-[10px] px-2.5 py-1 rounded hover:border-coral hover:text-coral"
            onClick={() => {
              signOut();
              router.push("/");
            }}
          >
            登出
          </button>
        </div>
      </nav>

      <div className="flex-1 relative overflow-hidden">
        <Sky />
        <StarsLayer />
        <Moon />
        <WeatherBadge />
        <TownClock />
        <div
          className="absolute top-3.5 left-1/2 -translate-x-1/2 font-pixel tracking-wider whitespace-nowrap z-[6]"
          style={{
            color: "var(--a2)",
            textShadow: "0 0 10px var(--a1), 0 0 26px var(--a3)",
            fontSize: "clamp(8px,1.9vw,10px)",
          }}
        >
          ✦ FOCUS TOWN ✦
        </div>
      </div>

      <section className="h-[156px] grid grid-cols-3 gap-1.5 p-1.5 bg-[rgba(2,0,12,.98)] border-t border-border">
        <TimerPanel />
        <LeaderboardPanel onMatchClick={onMatch} />
        <MusicPanel />
      </section>

      <MatchModal open={matchOpen} onClose={() => setMatchOpen(false)} />
    </main>
  );
}
