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
import { CityBackground } from "@/components/scene/CityBackground";
import { StarsLayer } from "@/components/scene/StarsLayer";
import { Pedestrians } from "@/components/scene/Pedestrians";
import { CarsLane } from "@/components/scene/CarsLane";
import { RainOverlay } from "@/components/pixel/RainOverlay";
import { FrameTicker } from "@/components/pixel/FrameTicker";
import { TickerBar } from "@/components/chrome/TickerBar";
import { StreetProps } from "@/components/scene/StreetProps";
import { Road } from "@/components/scene/Road";
import { SCENES } from "@/lib/data/scenes";

// Reference-design town visuals (Page 3 of UI sync). The named
// 9-building cityscape, pixel celestial sprite, FOCUS BROADCAST sky
// window, and 3-cluster top HUD.
import { NamedBuildings } from "@/components/town/scene/NamedBuildings";
import { CelestialBody } from "@/components/town/scene/CelestialBody";
import { SkyWindow } from "@/components/town/scene/SkyWindow";
import { TownTopHUD, type TownModalKind } from "@/components/town/scene/TownTopHUD";
import { NamedWalkers } from "@/components/town/npc/NamedWalkers";
import { NamedCats } from "@/components/town/npc/NamedCats";
import { NamedBirds } from "@/components/town/npc/NamedBirds";
import { NamedCars } from "@/components/town/npc/NamedCars";
import { Clouds } from "@/components/scene/Clouds";

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

import { MatchModal } from "@/components/modals/MatchModal";
import { ShopModal } from "@/components/modals/ShopModal";
import { AchievementsModal } from "@/components/modals/AchievementsModal";
import { FeedbackModal } from "@/components/modals/FeedbackModal";
import { FriendsModal } from "@/components/modals/FriendsModal";
import { ProfileModal } from "@/components/modals/ProfileModal";
import { BottomHUD } from "@/components/town/bottom/BottomHUD";

const STREET_CAP = Number(process.env.NEXT_PUBLIC_STREET_CAP ?? 12);

export default function TownPage() {
  const { user, hydrate } = useAuthStore();
  const advanceScene = useSceneStore((s) => s.advance);
  const pendingRehydrate = usePresenceStore((s) => s.pendingRehydrate);
  const [matchOpen, setMatchOpen] = useState(false);
  const [openModal, setOpenModal] = useState<TownModalKind | null>(null);
  const requestAutoMatch = useMatchStore((s) => s.requestAuto);
  const matchProposing = useMatchStore((s) => s.proposing);

  // Reused by both the BottomHUD "Find Buddy" button and the FriendsModal
  // CTA so the matching flow stays consistent (SRP — single behavior, two
  // call sites).
  const onFindBuddy = async () => {
    if (matchProposing) return;
    const m = await requestAutoMatch();
    if (m) setMatchOpen(true);
  };

  const onOpenOwnProfile = () => {
    setOpenModal("profile");
  };

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

  // Open the modal whenever a proposal appears in the store, regardless
  // of source (WS fan-out, manual `requestAuto`, or the test-only
  // `testInjectProposal` bridge). This is the single reactive contract
  // that decouples "a match exists" from "how it got there".
  const matchCurrent = useMatchStore((s) => s.current);
  useEffect(() => {
    if (matchCurrent && !matchOpen) setMatchOpen(true);
    // Intentionally only reacts to a new proposal landing; the close
    // path is driven by the modal's onClose handler, not by `current`
    // going null (which also happens during accept/skip).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchCurrent?.id]);
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
      <TownTopHUD onOpenModal={setOpenModal} onOpenOwnProfile={onOpenOwnProfile} />

      {/* ═══ SCENE (full-bleed, no bottom panel row) ═══
           z-order: sky → stars → shooting stars → celestial sprite → planes →
           named skyline → ground crowd → rain overlay → sky window → HUD. */}
      <div className="flex-1 relative overflow-hidden">
        <Sky />
        <StarsLayer />
        {sceneHasStars ? <ShootingStars /> : null}
        <CelestialBody />

        {/* City 1 distant skyline (832833 pack, 5 layers Day+Night) — sits
            behind the named buildings so the canonical landmarks still
            read as foreground. Layers 1-3 only for now; 4-5 reserved for
            a future "extended depth" tuning if the named skyline feels
            too thin against the new background. */}
        <CityBackground />

        {/* 801184 sprite clouds — mounted for ALL scenes (not just cloudy)
            per Phase 1.E. Density + palette + opacity vary by scene; the
            rAF tick is per-scene by render but always runs since clouds
            are now part of every sky. */}
        <Clouds />

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

        {/* news ticker — drifts above the bottom HUD. Rendered twice
            per reference (screen-town.jsx:L127-L128) so the two
            independent setInterval phases layer into a subtle cross-fade. */}
        <TickerBar />
        <TickerBar />

        {/* Reference-aligned 180 px BottomHUD: FocusTimer + MatchPanel
            + MusicPlayer in a 1.05fr / 1fr / 1fr grid. Replaces the
            scattered TimerPanel + MatchCTA + BigFocusCTA + PersonalRadio
            block (audio playback follow-up will re-mount city radio
            once `useCityRadio()` is extracted). */}
        <BottomHUD onFindBuddy={onFindBuddy} />
      </div>

      <MatchModal open={matchOpen} onClose={() => setMatchOpen(false)} />
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
      <FeedbackModal
        open={openModal === "feedback"}
        onClose={() => setOpenModal(null)}
      />
      <ProfileModal
        open={openModal === "profile"}
        onClose={() => setOpenModal(null)}
        onRouteToModal={(k) => setOpenModal(k)}
      />
    </main>
    </FrameTicker>
  );
}
