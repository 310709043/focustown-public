"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { presenceApi, userItemsApi, walletApi } from "@/lib/api/endpoints";
import { useAuthStore } from "@/lib/state/authStore";
import { useHudReveal } from "@/lib/hooks/useHudReveal";
import { useImmersiveFocus } from "@/lib/hooks/useImmersiveFocus";
import { usePresenceStore } from "@/lib/state/presenceStore";
import { SCENE_TICK_MS, useSceneStore } from "@/lib/state/sceneStore";
import { useUserItemsStore } from "@/lib/state/userItemsStore";
import { useWalletStore } from "@/lib/state/walletStore";
import { useRealtime } from "@/lib/ws/useRealtime";
import { useRealtimeMatch } from "@/lib/ws/useRealtimeMatch";
import { useRealtimeSessionCompleted } from "@/lib/ws/useRealtimeSessionCompleted";
import { useMatchStore } from "@/lib/state/matchStore";
import { useStationStore } from "@/lib/state/stationStore";
import { useRouter } from "@/i18n/routing";

import { SceneBackdrop } from "@/components/scene/SceneBackdrop";
import { Pedestrians } from "@/components/scene/Pedestrians";
import { CarsLane } from "@/components/scene/CarsLane";
import { RainOverlay } from "@/components/pixel/RainOverlay";
import { FrameTicker } from "@/components/pixel/FrameTicker";
import { StreetProps } from "@/components/scene/StreetProps";
import { Road } from "@/components/scene/Road";

// Reference-design town visuals (Page 3 of UI sync). The named
// 9-building cityscape, FOCUS BROADCAST sky window, and 3-cluster
// top HUD. The pre-v2 Sky / Stars / CelestialBody / CityBackground /
// Clouds stack is replaced by SceneBackdrop — each scene paints with
// one 322807 city composite (sky + buildings + stars + moon baked in)
// plus small 801184 sprite clouds and an optional 281031 moon-stars
// sky overlay for night scenes.
import { NamedBuildings } from "@/components/town/scene/NamedBuildings";
import { SkyWindow } from "@/components/town/scene/SkyWindow";
import { TownTopHUD, type TownModalKind } from "@/components/town/scene/TownTopHUD";
import { NamedWalkers } from "@/components/town/npc/NamedWalkers";
import { NamedCats } from "@/components/town/npc/NamedCats";
import { NamedBirds } from "@/components/town/npc/NamedBirds";
import { NamedCars } from "@/components/town/npc/NamedCars";

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

import { MatchModal } from "@/components/modals/MatchModal";
import { ShopModal } from "@/components/modals/ShopModal";
import { AchievementsModal } from "@/components/modals/AchievementsModal";
import { FriendsModal } from "@/components/modals/FriendsModal";
import { ProfileModal } from "@/components/modals/ProfileModal";
import { BottomHUD } from "@/components/town/bottom/BottomHUD";
import { EdgeRevealSentinel } from "@/components/town/focus/EdgeRevealSentinel";
import { ImmersiveCountdown } from "@/components/town/focus/ImmersiveCountdown";
import { OnboardingTour } from "@/components/onboarding/OnboardingTour";

// 200 sprites is well within desktop-perf headroom (each Pedestrian is one
// DOM subtree + one setInterval). The backend orders real users first then
// bots, so a high cap guarantees no logged-in human is dropped on a busy day.
const STREET_CAP = Number(process.env.NEXT_PUBLIC_STREET_CAP ?? 200);

export default function TownPage() {
  const { user, hydrate } = useAuthStore();
  const router = useRouter();
  const advanceScene = useSceneStore((s) => s.advance);
  const pendingRehydrate = usePresenceStore((s) => s.pendingRehydrate);
  const [openModal, setOpenModal] = useState<TownModalKind | null>(null);
  const enterQueue = useMatchStore((s) => s.enterQueue);
  const rehydrateMatch = useMatchStore((s) => s.rehydrate);
  const matchStatus = useMatchStore((s) => s.status);
  const acceptedMatch = useMatchStore((s) => s.accepted);

  // The BottomHUD "Find Buddy" button and the FriendsModal CTA both call
  // enterQueue. The store guards against double-enqueue (waiting/proposed
  // states early-return) so there's no need for a local debounce.
  const onFindBuddy = async () => {
    if (matchStatus !== "idle") return;
    await enterQueue();
  };

  const onOpenOwnProfile = () => {
    setOpenModal("profile");
  };

  useEffect(() => {
    if (!user) void hydrate();
  }, [user, hydrate]);

  // Rehydrate the matching queue state on mount — the sessionStorage
  // persistence carries the status across reloads, but the backend is the
  // source of truth (the queue could have moved on while the tab was away).
  useEffect(() => {
    if (!user) return;
    void rehydrateMatch();
  }, [user, rehydrateMatch]);

  // /town IS City Mode. Set the active station scope at page level so
  // ModeStatusBar (a sibling of MusicPlayer in the BottomHUD render
  // order) reads the right value on first paint — no implicit
  // `?? "city"` fallback required. Previously this was done inside
  // MusicPlayer, which mounts *after* ModeStatusBar.
  useEffect(() => {
    useStationStore.getState().setActiveScope({
      kind: "city",
      id: "lowbatterytown",
    });
  }, []);

  useEffect(() => {
    const id = setInterval(advanceScene, SCENE_TICK_MS);
    return () => clearInterval(id);
  }, [advanceScene]);

  // Hydrate the street view from the snapshot endpoint, then re-hydrate every
  // 60 seconds as drift correction (in case any WS delta got dropped). Seed
  // self into the projection synchronously so ONLINE reflects the viewer
  // before HTTP/WS resolve — backend snapshots overwrite this on arrival.
  useEffect(() => {
    if (!user) return;
    usePresenceStore.getState().injectSelf(user);
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
    // Debounce: coalesce burst arrivals into a single snapshot fetch. Kept
    // short so the ONLINE count tracks reality without a perceptible lag.
    const id = setTimeout(async () => {
      try {
        const users = await presenceApi.listStreet(STREET_CAP);
        usePresenceStore.getState().hydrate(users);
      } catch {
        usePresenceStore.getState().clearPendingRehydrate();
      }
    }, 200);
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

  // Wave 1 / Lane A: subscribe to match + session events. ``applyProposed``
  // is a no-op when status !== "waiting", so the candidate side receiving
  // duplicate frames (one from MatchRealtimeLink + one from
  // MatchingQueueService) only transitions once. The auto-accept happens
  // inside applyProposed → the store's ``accepted`` slot lights up and
  // the effect below routes into the focus room. There's no proposal
  // step in the UI anymore (per product decision — reveal the partner
  // in the room).
  useRealtimeMatch({
    onProposed: (match) => {
      void useMatchStore.getState().applyProposed(match);
    },
    onAccepted: (_matchId) => {
      // Acceptance navigation is handled by the acceptedMatch effect
      // below — that single channel covers both candidate (via
      // applyProposed) and requester (via this WS frame after the
      // backend flips the row to accepted).
    },
  });

  // Auto-navigate into the focus room as soon as the store flips to
  // an accepted match. Sole entry point so candidate (auto-accept) and
  // requester (server-side accept WS frame) converge on the same nav.
  useEffect(() => {
    if (acceptedMatch?.id) {
      router.push(`/focus/${acceptedMatch.id}`);
    }
  }, [acceptedMatch, router]);

  useRealtimeSessionCompleted((_sessionId) => {
    // Clear the just-finished match so the Together mode card returns
    // from "Resume ▶ with {partner}" back to "Find ▶". Without this,
    // matchStore.accepted lingers forever and the card routes the user
    // to a focus room the backend already marked complete.
    useMatchStore.getState().clear();
  });

  const currentScene = useSceneStore((s) => s.current);
  const sceneIsWet = currentScene === "rain" || currentScene === "storm";

  // City-Mode immersive: edge-reveal state is owned here so the top
  // sentinel + TownTopHUD share one flag, and the bottom sentinel +
  // BottomHUD share another. The 24 px sentinels sit at the absolute
  // viewport edges; the user hovers them to summon the collapsed HUD
  // back briefly without exiting focus mode.
  const immersive = useImmersiveFocus();
  const { topRevealed, bottomRevealed, topHandlers, bottomHandlers } =
    useHudReveal();

  return (
    <FrameTicker>
    <main className="absolute inset-0 flex flex-col overflow-hidden">
      {/* Top HUD — reference's 3-cluster layout: logo+wordmark+weather chip
          on the left, UserStatusPill in the center, ACHV/SHOP/FRDS + clock
          + T-coin + sign-out on the right. Overlays the scene (absolute). */}
      <TownTopHUD
        onOpenModal={setOpenModal}
        onOpenOwnProfile={onOpenOwnProfile}
        edgeRevealed={topRevealed}
        onEdgeEnter={topHandlers.onPointerEnter}
        onEdgeLeave={topHandlers.onPointerLeave}
      />

      {/* City-Mode immersive countdown — pinned top-centre between the
          LOGO/WEATHER chip (left) and MiniClock (right). Always mounted;
          its own visibility is driven by the timer-running flag, so the
          fade is a pure CSS transition. */}
      <ImmersiveCountdown />

      {/* Edge sentinels — only mount while immersive so the page
          stays interaction-clean in normal city-mode. The sentinels'
          rendering + positioning is owned by EdgeRevealSentinel; this
          page owns only the mount decision and the handlers. */}
      {immersive ? (
        <>
          <EdgeRevealSentinel
            edge="top"
            testId="hud-top-sentinel"
            onPointerEnter={topHandlers.onPointerEnter}
            onPointerLeave={topHandlers.onPointerLeave}
          />
          <EdgeRevealSentinel
            edge="bottom"
            testId="hud-bottom-sentinel"
            onPointerEnter={bottomHandlers.onPointerEnter}
            onPointerLeave={bottomHandlers.onPointerLeave}
          />
        </>
      ) : null}

      {/* ═══ SCENE (full-bleed, no bottom panel row) ═══
           z-order: scene backdrop (city composite + cloud sprites + optional
           moon-stars sky overlay) → planes → named skyline → ground crowd →
           rain overlay → sky window → HUD.

           `--ground-shift` is the choreography hook for City-Mode immersive.
           When the timer is running, the whole ground stack (road, sidewalk,
           buildings, walkers, dogs, cars, cats) reads this variable inside
           a `calc()` and glides down 168 px so the road sits flush with the
           viewport bottom. Buildings still grow from the sidewalk — they
           travel with the ground — so the world stays physically grounded
           regardless of viewport size. */}
      <div
        className="flex-1 relative overflow-hidden scene-stage"
        style={
          {
            "--ground-shift": immersive ? "168px" : "0px",
          } as React.CSSProperties
        }
      >
        {/* v2 放鬆 backdrop — one 322807 city composite + 1–2 drifting 801184
            cloud sprites per scene; three night scenes also layer a 281031
            moon-stars sky overlay. Replaces the previous Sky + StarsLayer +
            ShootingStars + CelestialBody + CityBackground + Clouds stack. */}
        <SceneBackdrop />

        {/* two airplanes with offset cycles so the sky always has movement */}
        <Airplane intervalSeconds={22} delaySeconds={0} />
        <Airplane intervalSeconds={28} delaySeconds={-14} />

        {/* per-user songbirds — fly under the airplane silhouettes */}
        <Birds />
        {/* Three named scenery birds (Whisp / Echo / Wren) above the
            crowd — port of reference design. Coexists with <Birds />
            which renders presence-driven users. */}
        <NamedBirds />

        {/* 9 named pixel buildings, silent silhouettes — QA round 1
            rejected the floating accent-color labels above each, so
            we render the skyline without `BuildingTag`. Weather +
            time-of-day tints + night radial halo all preserved. */}
        <NamedBuildings showLabels={false} />

        {/* sidewalk props (lamps/trees/bench/cat) sit under moving crowd */}
        <StreetProps />

        {/* neon pixel asphalt — sits between pedestrians (sidewalk above)
            and cars (driving on top). Pure CSS; respects reduced-motion. */}
        <Road />

        {/* Seven named scenery walkers + two cats wander the sidewalk
            regardless of how many real users are online. Mounted BEFORE
            <Pedestrians /> so real-user sprites render on top — the
            player feels foregrounded among the town's residents. */}
        <NamedWalkers />
        <NamedCats />

        {/* ground crowd — every moving entity is a real online user;
            entityKindFor() routes each user to exactly one of these four. */}
        <Pedestrians />
        <Dogs />
        {/* Three named scenery cars on the road, mounted before
            <CarsLane /> so presence-driven vehicles render on top. */}
        <NamedCars />
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

        {/* Reference-aligned 180 px BottomHUD: FocusTimer + MatchPanel
            + MusicPlayer in a 1.05fr / 1fr / 1fr grid. Replaces the
            scattered TimerPanel + MatchCTA + BigFocusCTA + PersonalRadio
            block (audio playback follow-up will re-mount city radio
            once `useCityRadio()` is extracted). */}
        <BottomHUD
          onFindBuddy={onFindBuddy}
          edgeRevealed={bottomRevealed}
          onEdgeEnter={bottomHandlers.onPointerEnter}
          onEdgeLeave={bottomHandlers.onPointerLeave}
        />
      </div>

      <MatchModal />
      <ShopModal
        open={openModal === "shop"}
        onClose={() => setOpenModal(null)}
      />
      <AchievementsModal
        open={openModal === "achv"}
        onClose={() => setOpenModal(null)}
      />
      <FriendsModal
        open={openModal === "frds"}
        onClose={() => setOpenModal(null)}
        onFindBuddy={onFindBuddy}
      />
      <ProfileModal
        open={openModal === "profile"}
        onClose={() => setOpenModal(null)}
      />

      {/* First-time onboarding tour — auto-opens once per browser to
          introduce the City / Solo / Together focus modes. Mounts last
          so the spotlight overlay sits above the HUD but below other
          modals (the tour pauses itself naturally when a modal is open
          via z-index — modal backdrop is 50, tour overlay is 60). */}
      <OnboardingTour />
    </main>
    </FrameTicker>
  );
}
