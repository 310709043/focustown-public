"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { presenceApi, userItemsApi, walletApi } from "@/lib/api/endpoints";
import { useAuthStore } from "@/lib/state/authStore";
import { usePresenceStore } from "@/lib/state/presenceStore";
import { useSceneStore } from "@/lib/state/sceneStore";
import { useUserItemsStore } from "@/lib/state/userItemsStore";
import { useWalletStore } from "@/lib/state/walletStore";
import { useRealtime } from "@/lib/ws/useRealtime";
import { useRealtimeMatch } from "@/lib/ws/useRealtimeMatch";
import { useRealtimeSessionCompleted } from "@/lib/ws/useRealtimeSessionCompleted";
import { useMatchStore } from "@/lib/state/matchStore";

import { Sky } from "@/components/scene/Sky";
import { StarsLayer } from "@/components/scene/StarsLayer";
import { Pedestrians } from "@/components/scene/Pedestrians";
import { CarsLane } from "@/components/scene/CarsLane";
import { RainOverlay } from "@/components/pixel/RainOverlay";
import { FrameTicker } from "@/components/pixel/FrameTicker";
import { TickerBar } from "@/components/chrome/TickerBar";
import { StreetProps } from "@/components/scene/StreetProps";
import { Road } from "@/components/scene/Road";
import { SCENES } from "@/lib/data/scenes";

// Reference-design town visuals (Page 3 of UI sync). These replace the
// pre-port `Buildings` / `Moon` / `LeaderboardWindow` / `TownNavbar` /
// `Billboard` / `VenueCards` / `WeatherBadge` / `TownClock` set with
// the named 9-building cityscape, pixel celestial sprite, FOCUS
// BROADCAST sky window, and 3-cluster top HUD respectively.
import { NamedBuildings } from "@/components/town/scene/NamedBuildings";
import { CelestialBody } from "@/components/town/scene/CelestialBody";
import { SkyWindow } from "@/components/town/scene/SkyWindow";
import { TownTopHUD } from "@/components/town/scene/TownTopHUD";

// Ambient / animation-only scene entities lazy-load so they don't block
// the first paint. Each runs an independent animation loop, none of them
// is above the fold (sky stays static while these hop in), and they
// don't carry SSR-visible content — `ssr: false` keeps them out of the
// server render entirely.
const Airplane = dynamic(
  () => import("@/components/scene/Airplane").then((m) => ({ default: m.Airplane })),
  { ssr: false },
);
const Birds = dynamic(
  () => import("@/components/scene/Birds").then((m) => ({ default: m.Birds })),
  { ssr: false },
);
const Dogs = dynamic(
  () => import("@/components/scene/Dogs").then((m) => ({ default: m.Dogs })),
  { ssr: false },
);
const ShootingStars = dynamic(
  () => import("@/components/pixel/ShootingStars").then((m) => ({ default: m.ShootingStars })),
  { ssr: false },
);

import { TimerPanel } from "@/components/panels/TimerPanel";
import { PersonalRadio } from "@/components/audio/PersonalRadio";
import { MatchModal } from "@/components/modals/MatchModal";
import { BigFocusCTA } from "@/components/town/BigFocusCTA";
import { MatchCTA } from "@/components/town/MatchCTA";

const STREET_CAP = Number(process.env.NEXT_PUBLIC_STREET_CAP ?? 12);

export default function TownPage() {
  const { user, hydrate } = useAuthStore();
  const advanceScene = useSceneStore((s) => s.advance);
  const pendingRehydrate = usePresenceStore((s) => s.pendingRehydrate);
  const [matchOpen, setMatchOpen] = useState(false);
  const requestAutoMatch = useMatchStore((s) => s.requestAuto);
  const matchProposing = useMatchStore((s) => s.proposing);

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

  // Wave 1 / Lane A: subscribe to match + session events. The WS payload
  // for match.proposed lacks `reason`/`candidate_id`, so the hook
  // synthesizes a partial Match — MatchModal renders a fallback reason
  // string and a neutral placeholder candidate when those fields are empty.
  useRealtimeMatch({
    onProposed: (match) => {
      useMatchStore.setState({ current: match });
      setMatchOpen(true);
    },
    onAccepted: (_matchId) => {
      // TODO Wave 4: surface a toast / auto-navigate to the focus room.
    },
  });
  useRealtimeSessionCompleted((_sessionId) => {
    // TODO Wave 4: surface a "session complete" toast.
  });

  const currentScene = useSceneStore((s) => s.current);
  const sceneHasStars = SCENES[currentScene].stars > 0;
  const sceneIsWet = currentScene === "rain" || currentScene === "storm";

  return (
    <FrameTicker>
    <main className="absolute inset-0 flex flex-col overflow-hidden">
      {/* Top HUD — reference's 3-cluster layout: logo+wordmark+weather chip
          on the left, UserStatusPill in the center, ACHV/SHOP/FRDS + clock
          + T-coin + sign-out on the right. Overlays the scene (absolute). */}
      <TownTopHUD />

      {/* ═══ SCENE (full-bleed, no bottom panel row) ═══
           z-order: sky → stars → shooting stars → celestial sprite → planes →
           named skyline → ground crowd → rain overlay → sky window → HUD. */}
      <div className="flex-1 relative overflow-hidden">
        <Sky />
        <StarsLayer />
        {sceneHasStars ? <ShootingStars /> : null}
        <CelestialBody />

        {/* two airplanes with offset cycles so the sky always has movement */}
        <Airplane intervalSeconds={22} delaySeconds={0} />
        <Airplane intervalSeconds={28} delaySeconds={-14} />

        {/* per-user songbirds — fly under the airplane silhouettes */}
        <Birds />

        {/* 9 named pixel buildings (CAFE PIXEL → INK STORE) with floating
            tags + weather/time tints + night radial glow. */}
        <NamedBuildings />

        {/* sidewalk props (lamps/trees/bench/cat) sit under moving crowd */}
        <StreetProps />

        {/* neon pixel asphalt — sits between pedestrians (sidewalk above)
            and cars (driving on top). Pure CSS; respects reduced-motion. */}
        <Road />

        {/* ground crowd — every moving entity is a real online user;
            entityKindFor() routes each user to exactly one of these four. */}
        <Pedestrians />
        <Dogs />
        <CarsLane />

        {/* FOCUS BROADCAST sky window — tabbed rank / ad rotation with
            antenna, signal bars, and a LIVE indicator. */}
        <SkyWindow />

        {/* wet-scene atmosphere — only mounts for rain/storm so we don't
            spin a rAF loop on sunny days. */}
        {sceneIsWet ? (
          <RainOverlay
            color={currentScene === "storm" ? "#88a8d8" : "#00f5d4"}
            density={currentScene === "storm" ? 1.2 : 1}
          />
        ) : null}

        {/* Mobile bottom-left: BigFocusCTA stacked above TimerPanel.
            Phones don't get the shared rail because there's not enough
            horizontal room beside the centred MatchCTA. */}
        <div
          className="absolute z-[9] flex flex-col gap-2 items-stretch
                     left-3 right-3 bottom-[120px] xs:bottom-[140px]
                     md:hidden"
        >
          <BigFocusCTA />
          <TimerPanel />
        </div>

        {/* Tablet+ shared bottom rail: timer cluster (left) and city
            radio (right) on one baseline, 16px from each edge. Each
            cluster is 244px wide so they read as a matched pair. */}
        <div
          className="absolute inset-x-0 bottom-0 z-[9] hidden md:flex
                     items-end justify-between px-4 pb-4 pointer-events-none"
        >
          <div className="pointer-events-auto w-[244px] flex flex-col gap-2">
            <BigFocusCTA />
            <TimerPanel />
          </div>
          <div className="pointer-events-auto w-[244px]">
            <PersonalRadio context="city" contextId="city" />
          </div>
        </div>

        {/* news ticker — drifts above the bottom HUD */}
        <TickerBar />

        {/* bottom-center: match CTA — fetches a candidate via /matches/auto
            (real-first, bot fallback), then opens the modal with the result */}
        <MatchCTA
          disabled={matchProposing}
          onClick={async () => {
            const m = await requestAutoMatch();
            if (m) setMatchOpen(true);
          }}
        />
      </div>

      <MatchModal open={matchOpen} onClose={() => setMatchOpen(false)} />
    </main>
    </FrameTicker>
  );
}
