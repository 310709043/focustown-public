"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { Link, useRouter } from "@/i18n/routing";
import { ApiError } from "@/lib/api/client";
import {
  friendsApi,
  type FriendSearchResult,
  userApi,
  type PublicUserProfile,
} from "@/lib/api/endpoints";
import { useAuthStore } from "@/lib/state/authStore";
import { pushErrorToast, pushInfoToast } from "@/lib/state/toastStore";

type LoadState =
  | { kind: "loading" }
  | { kind: "self"; profile: PublicUserProfile }
  | {
      kind: "ready";
      profile: PublicUserProfile;
      status: FriendSearchResult["friendship_status"];
      friendshipId: string | null;
      requestedByMe: boolean;
    }
  | { kind: "not_found" }
  | { kind: "signin_required" };

export default function AddFriendDeepLinkPage() {
  const params = useParams();
  const router = useRouter();
  const targetId = typeof params?.id === "string" ? params.id : "";
  const t = useTranslations("profile.friends.deepLink");
  const tFriends = useTranslations("profile.friends");
  const viewer = useAuthStore((s) => s.user);
  const hydrate = useAuthStore((s) => s.hydrate);
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!viewer) void hydrate();
  }, [viewer, hydrate]);

  useEffect(() => {
    if (!targetId) return;
    let cancelled = false;
    (async () => {
      try {
        const profile = await userApi.getPublicProfile(targetId);
        if (cancelled) return;
        if (viewer?.id === targetId) {
          setState({ kind: "self", profile });
          return;
        }
        if (!viewer) {
          // No live auth — still show the citizen card so the recipient
          // sees who they're being invited by, but gate the CTA behind
          // the sign-in prompt.
          setState({ kind: "signin_required" });
          return;
        }
        const search = await friendsApi.search(targetId);
        const hit = search.results[0];
        setState({
          kind: "ready",
          profile,
          status: hit?.friendship_status ?? "none",
          friendshipId: hit?.friendship_id ?? null,
          requestedByMe: hit?.requested_by_me ?? false,
        });
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setState({ kind: "not_found" });
          return;
        }
        // Network / 5xx — treat as not_found so we don't expose internals
        // (per memory feedback-aws-ready-no-stack-leaks).
        setState({ kind: "not_found" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [targetId, viewer]);

  async function handleAdd() {
    if (state.kind !== "ready" || submitting) return;
    setSubmitting(true);
    try {
      const created = await friendsApi.request(targetId);
      pushInfoToast(
        t("addedToastBody", { name: state.profile.display_name }),
      );
      setState({
        kind: "ready",
        profile: state.profile,
        status: created.status,
        friendshipId: created.friendship_id,
        requestedByMe: created.requested_by_me,
      });
    } catch {
      pushErrorToast(t("addError"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAccept() {
    if (state.kind !== "ready" || !state.friendshipId || submitting) return;
    setSubmitting(true);
    try {
      const updated = await friendsApi.accept(state.friendshipId);
      setState({
        kind: "ready",
        profile: state.profile,
        status: updated.status,
        friendshipId: updated.friendship_id,
        requestedByMe: updated.requested_by_me,
      });
    } catch {
      pushErrorToast(t("addError"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main
      data-testid="add-friend-deep-link"
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        background:
          "linear-gradient(180deg, var(--sky-top) 0%, var(--sky-mid) 65%, var(--sky-low) 100%)",
      }}
    >
      <section
        className="pixel-panel"
        style={{
          width: "min(420px, 100%)",
          padding: 24,
          background: "var(--card)",
          display: "flex",
          flexDirection: "column",
          gap: 16,
          textAlign: "center",
        }}
      >
        <header
          className="font-pixel"
          style={{
            fontSize: 11,
            letterSpacing: "0.32em",
            color: "var(--accent-2)",
            textShadow: "var(--neon-glow)",
          }}
        >
          ✦ {t("title")}
        </header>

        {state.kind === "loading" ? (
          <p className="font-silkscreen" style={hintStyle}>
            ◌ {t("loading")}
          </p>
        ) : state.kind === "not_found" ? (
          <p className="font-silkscreen" style={hintStyle}>
            {t("notFound")}
          </p>
        ) : state.kind === "signin_required" ? (
          <>
            <p className="font-silkscreen" style={hintStyle}>
              {t("signInPrompt")}
            </p>
            <Link
              href={`/signin?returnTo=${encodeURIComponent(
                `/u/${targetId}`,
              )}`}
              className="pixel-btn font-silkscreen"
              style={ctaStyle}
            >
              {t("signInCta")}
            </Link>
          </>
        ) : state.kind === "self" ? (
          <>
            <CitizenSummary
              displayName={state.profile.display_name}
              roleLabel={state.profile.role_label}
            />
            <p className="font-silkscreen" style={hintStyle}>
              {t("selfBody")}
            </p>
            <button
              type="button"
              onClick={() => router.push("/town")}
              className="pixel-btn font-silkscreen"
              style={ctaStyle}
            >
              {t("selfBackToTown")}
            </button>
          </>
        ) : (
          <>
            <CitizenSummary
              displayName={state.profile.display_name}
              roleLabel={state.profile.role_label}
            />
            <FriendshipCta
              status={state.status}
              requestedByMe={state.requestedByMe}
              submitting={submitting}
              displayName={state.profile.display_name}
              onAdd={handleAdd}
              onAccept={handleAccept}
              tDeepLink={t}
              tFriends={tFriends}
            />
          </>
        )}
      </section>
    </main>
  );
}

function CitizenSummary({
  displayName,
  roleLabel,
}: {
  displayName: string;
  roleLabel: string | null;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        alignItems: "center",
      }}
    >
      <span
        className="font-silkscreen"
        style={{
          fontSize: 16,
          letterSpacing: "0.18em",
          color: "var(--ink)",
        }}
      >
        {displayName}
      </span>
      {roleLabel ? (
        <span
          className="font-silkscreen"
          style={{
            fontSize: 10,
            letterSpacing: "0.28em",
            color: "var(--ink-mute)",
          }}
        >
          {roleLabel}
        </span>
      ) : null}
    </div>
  );
}

function FriendshipCta({
  status,
  requestedByMe,
  submitting,
  displayName,
  onAdd,
  onAccept,
  tDeepLink,
  tFriends,
}: {
  status: FriendSearchResult["friendship_status"];
  requestedByMe: boolean;
  submitting: boolean;
  displayName: string;
  onAdd: () => void;
  onAccept: () => void;
  tDeepLink: ReturnType<typeof useTranslations>;
  tFriends: ReturnType<typeof useTranslations>;
}) {
  if (status === "accepted") {
    return (
      <p
        data-testid="deep-link-already-friends"
        className="font-silkscreen"
        style={hintStyle}
      >
        {tDeepLink("alreadyFriends")}
      </p>
    );
  }
  if (status === "blocked") {
    return (
      <p
        data-testid="deep-link-blocked"
        className="font-silkscreen"
        style={hintStyle}
      >
        {tDeepLink("blocked")}
      </p>
    );
  }
  if (status === "requested") {
    if (requestedByMe) {
      return (
        <p
          data-testid="deep-link-pending-out"
          className="font-silkscreen"
          style={hintStyle}
        >
          {tDeepLink("pendingOutgoing", { name: displayName })}
        </p>
      );
    }
    return (
      <button
        type="button"
        data-testid="deep-link-accept"
        onClick={onAccept}
        disabled={submitting}
        className="pixel-btn font-silkscreen disabled:opacity-60 disabled:cursor-not-allowed"
        style={ctaStyle}
      >
        {submitting
          ? tDeepLink("pendingIncomingSubmitting")
          : tDeepLink("pendingIncomingCta", { name: displayName })}
      </button>
    );
  }
  // status === "none"
  return (
    <button
      type="button"
      data-testid="deep-link-add"
      onClick={onAdd}
      disabled={submitting}
      className="pixel-btn font-silkscreen disabled:opacity-60 disabled:cursor-not-allowed"
      style={ctaStyle}
    >
      {submitting ? tFriends("addSubmitting") : tDeepLink("addCta")}
    </button>
  );
}

const hintStyle = {
  margin: 0,
  fontSize: 12,
  lineHeight: 1.7,
  letterSpacing: "0.12em",
  color: "var(--ink-mute)",
} as const;

const ctaStyle = {
  padding: "10px 18px",
  fontSize: 12,
  letterSpacing: "0.22em",
  background: "var(--accent)",
  borderColor: "var(--accent)",
  color: "#0c0524",
  textDecoration: "none",
  textAlign: "center",
} as const;
