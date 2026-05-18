"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { CitizenIdCard } from "@/components/profile/CitizenIdCard";
import { MiniClock } from "@/components/chrome/MiniClock";
import { CelestialBody } from "@/components/town/scene/CelestialBody";
import { Logo } from "@/components/scene/Logo";
import { PixelWord } from "@/components/pixel/PixelWord";
import { Sky } from "@/components/scene/Sky";
import { StarsLayer } from "@/components/scene/StarsLayer";
import { useRouter } from "@/i18n/routing";
import { userApi, type PublicUserProfile } from "@/lib/api/endpoints";
import { useAuthStore } from "@/lib/state/authStore";

/**
 * Public citizen profile — opened when a user clicks a leaderboard row.
 *
 * Layout: reuses `<Sky/>` + `<StarsLayer/>` + `<CelestialBody/>` from the
 * town so the card floats over the same skyline the viewer just clicked
 * from (no buildings, no NPCs — focus stays on the card).
 *
 * Data: fetches `/api/v1/users/{id}/public`. Auth-gated — un-signed-in
 * viewers are redirected to `/signin`. Backend round 1 only computes
 * `today_focus_minutes`; the rest of the stats render as "—" until
 * follow-up rounds add streak/level/all-time aggregates.
 */
export default function CitizenProfilePage() {
  const params = useParams();
  const router = useRouter();
  const userId = typeof params?.id === "string" ? params.id : "";
  const viewer = useAuthStore((s) => s.user);
  const hydrate = useAuthStore((s) => s.hydrate);
  const [profile, setProfile] = useState<PublicUserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!viewer) void hydrate();
  }, [viewer, hydrate]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await userApi.getPublicProfile(userId);
        if (!cancelled) setProfile(data);
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "fetch_failed";
        setError(message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return (
    <main
      data-testid="user-profile-page"
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        background:
          "linear-gradient(180deg, var(--sky-top) 0%, var(--sky-mid) 65%, var(--sky-low) 100%)",
      }}
    >
      <Sky />
      <StarsLayer />
      <CelestialBody />

      <header
        style={{
          position: "relative",
          zIndex: 5,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 18px",
          gap: 12,
          background:
            "linear-gradient(180deg, rgba(7,4,26,0.85) 0%, rgba(7,4,26,0) 100%)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            type="button"
            className="pixel-btn"
            style={{ fontSize: 11, padding: "6px 12px" }}
            onClick={() => router.push("/town")}
          >
            ◀ BACK
          </button>
          <Logo scale={1} />
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <PixelWord
              text="FOCUSTOWN"
              scale={2}
              color="var(--accent)"
              glow="var(--accent)"
            />
            <span
              className="font-silkscreen"
              style={{
                fontSize: 8,
                color: "var(--ink-dim)",
                letterSpacing: "0.2em",
              }}
            >
              · CITIZEN REGISTRY
            </span>
          </div>
        </div>
        <MiniClock />
      </header>

      <section
        style={{
          position: "relative",
          zIndex: 5,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "32px 16px 48px",
          minHeight: "calc(100% - 70px)",
        }}
      >
        {profile ? (
          <CitizenIdCard profile={profile} />
        ) : error ? (
          <ErrorState message={error} />
        ) : (
          <LoadingState />
        )}
      </section>
    </main>
  );
}

function LoadingState() {
  return (
    <div
      className="pixel-panel font-silkscreen"
      style={{
        padding: "24px 32px",
        color: "var(--ink-mute)",
        letterSpacing: "0.25em",
        fontSize: 12,
      }}
    >
      ◌ TUNING SIGNAL · STAND BY
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div
      className="pixel-panel font-silkscreen"
      style={{
        padding: "24px 32px",
        color: "var(--accent-2)",
        letterSpacing: "0.15em",
        fontSize: 12,
        textAlign: "center",
        maxWidth: 420,
      }}
    >
      ✦ CITIZEN NOT FOUND
      <div
        style={{
          marginTop: 10,
          fontSize: 10,
          color: "var(--ink-dim)",
          letterSpacing: "0.1em",
        }}
      >
        {message}
      </div>
    </div>
  );
}
