"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { presenceApi, roomApi, userItemsApi, walletApi } from "@/lib/api/endpoints";
import { useAuthStore } from "@/lib/state/authStore";
import { usePresenceStore } from "@/lib/state/presenceStore";
import { useSceneStore } from "@/lib/state/sceneStore";
import { useUserItemsStore } from "@/lib/state/userItemsStore";
import { useWalletStore } from "@/lib/state/walletStore";
import { findCharacter } from "@/lib/data/characters";
import { useRealtime } from "@/lib/ws/useRealtime";

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
import { LeaderboardWindow } from "@/components/scene/LeaderboardWindow";

import { TimerPanel } from "@/components/panels/TimerPanel";
import { MusicPanel } from "@/components/panels/MusicPanel";
import { MatchModal } from "@/components/modals/MatchModal";
import { BigFocusCTA } from "@/components/town/BigFocusCTA";
import { MatchCTA } from "@/components/town/MatchCTA";
import { CoinBadge } from "@/components/town/CoinBadge";

const STREET_CAP = Number(process.env.NEXT_PUBLIC_STREET_CAP ?? 12);

export default function TownPage() {
  const router = useRouter();
  const { user, hydrate, signOut } = useAuthStore();
  const advanceScene = useSceneStore((s) => s.advance);
  const onlineCount = usePresenceStore((s) => Object.keys(s.byId).length);
  const pendingRehydrate = usePresenceStore((s) => s.pendingRehydrate);
  const ownedItemsCount = useUserItemsStore((s) => Object.keys(s.byShopItemId).length);
  const [matchOpen, setMatchOpen] = useState(false);

  useEffect(() => {
    if (!user) void hydrate();
  }, [user, hydrate]);

  useEffect(() => {
    // Auto-rotate scenes every 2 minutes for the demo loop.
    const id = setInterval(advanceScene, 2 * 60_000);
    return () => clearInterval(id);
  }, [advanceScene]);

  // Hydrate the street view from the snapshot endpoint, then re-hydrate every
  // 60 seconds as drift correction (in case any WS delta got dropped).
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const fetchSnapshot = async () => {
      try {
        const users = await presenceApi.listStreet(STREET_CAP);
        if (!cancelled) usePresenceStore.getState().hydrate(users);
      } catch {
        /* surfaced as empty street; next tick will retry */
      }
    };
    void fetchSnapshot();
    const id = setInterval(fetchSnapshot, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
      usePresenceStore.getState().reset();
    };
  }, [user]);

  // Subscribe to incremental presence deltas via WebSocket. Unknown users in
  // a delta flip pendingRehydrate, which the next effect picks up and resolves.
  useRealtime((msg) => {
    if (msg.type === "presence.changed") {
      usePresenceStore.getState().applyDelta({
        user_id: String(msg.user_id),
        state: msg.state as never,
        status: msg.status as string | undefined,
        equipment_changed: Boolean(msg.equipment_changed),
      });
    }
  });

  useEffect(() => {
    if (!pendingRehydrate || !user) return;
    // Debounce: coalesce burst arrivals into a single snapshot fetch.
    const id = setTimeout(async () => {
      try {
        const users = await presenceApi.listStreet(STREET_CAP);
        usePresenceStore.getState().hydrate(users);
      } catch {
        usePresenceStore.getState().clearPendingRehydrate();
      }
    }, 1000);
    return () => clearTimeout(id);
  }, [pendingRehydrate, user]);

  // Phase 2: hydrate wallet + owned-items, then keep wallet in sync via WS.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const sync = async () => {
      try {
        const [wallets, items] = await Promise.all([
          walletApi.list(),
          userItemsApi.list(),
        ]);
        if (cancelled) return;
        useWalletStore.getState().hydrate(wallets);
        useUserItemsStore.getState().hydrate(items);
      } catch {
        /* tolerate transient network glitches */
      }
    };
    void sync();
    return () => {
      cancelled = true;
      useWalletStore.getState().reset();
      useUserItemsStore.getState().reset();
    };
  }, [user]);

  useRealtime((msg) => {
    if (msg.type === "wallet.updated") {
      useWalletStore.getState().setBalance(
        String(msg.currency_code),
        Number(msg.balance_minor),
      );
    }
  });

  const myChar = findCharacter(user?.character_key);

  return (
    <main className="absolute inset-0 flex flex-col overflow-hidden">
      {/* ═══ LAYER 1: navbar — logo left, T-coin leftmost in right cluster ═══ */}
      <nav
        className="bg-[rgba(2,0,12,0.97)] border-b border-border flex items-center justify-between px-5 z-10"
        style={{ height: 56 }}
      >
        <div className="flex items-center gap-3">
          <Logo scale={1.4} />
        </div>
        <div className="flex gap-2 items-center">
          <CoinBadge />
          <span
            className="rounded-md px-2.5 py-2 flex items-center gap-1.5"
            style={{
              background: "rgba(52,211,153,0.06)",
              border: "1px solid rgba(52,211,153,0.35)",
              fontSize: 12,
              color: "var(--teal)",
              fontFamily: "VT323, monospace",
              letterSpacing: 0.6,
              textShadow: "0 0 6px rgba(52,211,153,0.4)",
            }}
            title="目前街上的人數"
          >
            <span style={{ fontSize: 13 }}>👥</span>
            <span>在線 {onlineCount}</span>
          </span>
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
          <button
            className="font-japan rounded-md px-3 py-2 transition-colors flex items-center gap-1.5"
            style={{
              fontSize: 13,
              background:
                "linear-gradient(180deg, rgba(252,211,77,0.16), rgba(252,211,77,0.06))",
              border: "1px solid var(--amber)",
              color: "var(--amber)",
              textShadow: "0 0 8px rgba(252,211,77,0.35)",
              boxShadow:
                "0 0 12px rgba(252,211,77,0.18), inset 0 0 8px rgba(252,211,77,0.08)",
            }}
            onClick={async () => {
              try {
                const room = await roomApi.getMine();
                // typed-routes doesn't know about /town/room/[id]; safe cast.
                router.push(`/town/room/${room.id}` as Parameters<typeof router.push>[0]);
              } catch {
                /* hydration retry on next click; surfaced via roomStore. */
              }
            }}
            title="進入我的房間"
          >
            🏠 我的房間
          </button>
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
              🔓 {ownedItemsCount}
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

      {/* ═══ SCENE (full-bleed, no bottom panel row) ═══ */}
      <div className="flex-1 relative overflow-hidden">
        <Sky />
        <StarsLayer />
        <Moon />

        {/* two airplanes with offset cycles so the sky always has movement */}
        <Airplane intervalSeconds={22} delaySeconds={0} />
        <Airplane intervalSeconds={28} delaySeconds={-14} />

        <WeatherBadge />
        <TownClock />

        {/* skyline + ground crowd */}
        <Buildings />
        <Pedestrians />
        <CarsLane />

        {/* central billboard */}
        <Billboard />

        {/* top-center: leaderboard "city window" */}
        <LeaderboardWindow />

        {/* bottom-left: BigFocusCTA stacked above TimerPanel */}
        <div
          className="absolute z-[9] flex flex-col gap-2 items-stretch"
          style={{ left: 16, bottom: 16, width: 244 }}
        >
          <BigFocusCTA />
          <TimerPanel />
        </div>

        {/* bottom-right: MusicPanel floating card */}
        <div
          className="absolute z-[9]"
          style={{ right: 16, bottom: 16, width: 244 }}
        >
          <MusicPanel />
        </div>

        {/* bottom-center: match CTA */}
        <MatchCTA onClick={() => setMatchOpen(true)} />
      </div>

      <MatchModal open={matchOpen} onClose={() => setMatchOpen(false)} />
    </main>
  );
}
