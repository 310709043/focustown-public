"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { ApiError } from "@/lib/api/client";
import { friendsApi } from "@/lib/api/endpoints";
import {
  selectAccepted,
  selectIncomingRequests,
  selectOutgoingRequests,
  useFriendsStore,
} from "@/lib/state/friendsStore";
import { pushErrorToast, pushInfoToast } from "@/lib/state/toastStore";

import { FriendRow } from "./FriendRow";

interface FriendsViewProps {
  onClose: () => void;
}

type Tab = "friends" | "incoming" | "outgoing";

function mapAddError(t: (k: string) => string, err: unknown): string {
  if (!(err instanceof ApiError)) return t("addGenericError");
  if (err.status === 404) return t("addInvalidError");
  if (err.status === 400 || err.status === 422) return t("addSelfError");
  if (err.status === 409) return t("addExistingError");
  return t("addGenericError");
}

export function FriendsView({ onClose }: FriendsViewProps) {
  const t = useTranslations("profile.friends");
  const tModal = useTranslations("profile.modal");
  const [tab, setTab] = useState<Tab>("friends");
  const [loading, setLoading] = useState(true);
  const [inviteId, setInviteId] = useState("");
  const [inviteState, setInviteState] = useState<
    | { kind: "idle" }
    | { kind: "submitting" }
    | { kind: "error"; msg: string }
  >({ kind: "idle" });

  const hydrate = useFriendsStore((s) => s.hydrate);
  const upsert = useFriendsStore((s) => s.upsert);
  const remove = useFriendsStore((s) => s.remove);
  const accepted = useFriendsStore(selectAccepted);
  const incoming = useFriendsStore(selectIncomingRequests);
  const outgoing = useFriendsStore(selectOutgoingRequests);

  // Mount-once fetch. Previous implementation wrapped this in useCallback
  // with `[hydrate, t]` deps and ran it inside a useEffect keyed on the
  // callback — under certain hydration sequences `t` from next-intl
  // returns a new function reference each render, which made `reload` a
  // new ref every render and triggered React #185 "Maximum update depth
  // exceeded". Inlining the fetch with no deps breaks the cycle.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [a, p] = await Promise.all([
          friendsApi.list("accepted"),
          friendsApi.list("requested"),
        ]);
        if (!cancelled) hydrate({ accepted: a.items, incoming: p.items });
      } catch {
        if (!cancelled) pushErrorToast(t("loadError"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // `hydrate` (zustand action) and `t` (next-intl) are stable in
    // practice; leaving them out of the deps array is intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = useMemo(() => {
    if (tab === "friends") return accepted;
    if (tab === "incoming") return incoming;
    return outgoing;
  }, [tab, accepted, incoming, outgoing]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (inviteState.kind === "submitting") return;
    const target = inviteId.trim();
    if (!target) {
      setInviteState({ kind: "error", msg: t("addEmptyError") });
      return;
    }
    setInviteState({ kind: "submitting" });
    try {
      const created = await friendsApi.request(target);
      upsert(created);
      setInviteId("");
      setInviteState({ kind: "idle" });
      setTab("outgoing");
    } catch (err) {
      setInviteState({ kind: "error", msg: mapAddError(t, err) });
    }
  }

  async function handleAccept(friendshipId: string) {
    try {
      const updated = await friendsApi.accept(friendshipId);
      upsert(updated);
    } catch {
      pushErrorToast(t("loadError"));
    }
  }

  async function handleReject(friendshipId: string) {
    try {
      await friendsApi.reject(friendshipId);
      remove(friendshipId);
    } catch {
      pushErrorToast(t("loadError"));
    }
  }

  async function handleUnfriend(friendshipId: string) {
    if (typeof window !== "undefined" && !window.confirm(t("unfriendConfirm")))
      return;
    try {
      await friendsApi.unfriend(friendshipId);
      remove(friendshipId);
      pushInfoToast(t("actionUnfriend"));
    } catch {
      pushErrorToast(t("loadError"));
    }
  }

  return (
    <div
      data-testid="friends-view"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 14,
        padding: "20px 24px",
        overflowY: "auto",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span
          className="font-silkscreen"
          style={{
            fontSize: 12,
            letterSpacing: "0.32em",
            color: "var(--accent-2)",
          }}
        >
          ● {t("title")}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label={tModal("closeAria")}
          className="font-silkscreen"
          style={{
            padding: "6px 12px",
            fontSize: 11,
            letterSpacing: "0.25em",
            color: "var(--ink-mute)",
            background: "transparent",
            border: "1px solid var(--panel-stroke)",
            cursor: "pointer",
          }}
        >
          ✕ {tModal("close")}
        </button>
      </header>

      <form
        onSubmit={handleInvite}
        className="pixel-panel"
        style={{
          padding: 12,
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "center",
          background: "rgba(20,10,55,0.45)",
        }}
      >
        <input
          type="text"
          value={inviteId}
          onChange={(e) => setInviteId(e.target.value)}
          placeholder={t("addPlaceholder")}
          className="pixel-input"
          style={{ flex: "1 1 200px" }}
          maxLength={36}
        />
        <button
          type="submit"
          disabled={inviteState.kind === "submitting"}
          className="pixel-btn font-silkscreen disabled:opacity-60 disabled:cursor-not-allowed"
          style={{
            padding: "8px 16px",
            fontSize: 11,
            letterSpacing: "0.22em",
            background: "var(--accent)",
            borderColor: "var(--accent)",
            color: "#0c0524",
          }}
        >
          {inviteState.kind === "submitting"
            ? t("addSubmitting")
            : t("addSubmit")}
        </button>
        {inviteState.kind === "error" ? (
          <div
            className="font-silkscreen"
            style={{
              flexBasis: "100%",
              fontSize: 11,
              color: "#f472b6",
              letterSpacing: "0.18em",
            }}
          >
            {inviteState.msg}
          </div>
        ) : null}
      </form>

      <nav style={{ display: "flex", gap: 6 }}>
        {(["friends", "incoming", "outgoing"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className="font-silkscreen"
            style={{
              padding: "6px 14px",
              fontSize: 11,
              letterSpacing: "0.24em",
              color: tab === k ? "#0c0524" : "var(--ink-mute)",
              background: tab === k ? "var(--accent-3)" : "rgba(20,10,55,0.45)",
              border: "1px solid var(--panel-stroke)",
              cursor: "pointer",
            }}
          >
            {t(
              k === "friends"
                ? "tabFriends"
                : k === "incoming"
                  ? "tabIncoming"
                  : "tabOutgoing",
            )}
          </button>
        ))}
      </nav>

      {loading ? (
        <div
          className="font-silkscreen"
          style={{
            padding: "24px 12px",
            border: "1px dashed var(--panel-stroke)",
            fontSize: 11,
            letterSpacing: "0.22em",
            color: "var(--ink-mute)",
            textAlign: "center",
          }}
        >
          ◌ {t("loading")}
        </div>
      ) : rows.length === 0 ? (
        <div
          className="font-silkscreen"
          style={{
            padding: "24px 12px",
            border: "1px dashed var(--panel-stroke)",
            fontSize: 11,
            letterSpacing: "0.18em",
            color: "var(--ink-mute)",
            textAlign: "center",
            lineHeight: 1.7,
          }}
        >
          {tab === "friends"
            ? t("emptyFriends")
            : tab === "incoming"
              ? t("emptyIncoming")
              : t("emptyOutgoing")}
        </div>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
          {rows.map((row) => (
            <FriendRow
              key={row.friendship_id}
              friend={row}
              tab={tab}
              onAccept={() => handleAccept(row.friendship_id)}
              onReject={() => handleReject(row.friendship_id)}
              onUnfriend={() => handleUnfriend(row.friendship_id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
