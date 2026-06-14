"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { PixelSprite } from "@/components/pixel/PixelSprite";
import { friendsApi, type FocusingNowItem } from "@/lib/api/endpoints";
import { characterKeyToAvatar } from "@/lib/data/character-to-avatar";
import {
  useFriendsStore,
} from "@/lib/state/friendsStore";

/** Compact minute counter from a session.started_at ISO string. */
function minutesSince(iso: string): number {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 60_000));
}

/**
 * "Friends focusing now" right-column panel.
 *
 * Pulls live data from ``GET /api/v1/friends/focusing-now`` on mount and
 * caches into ``useFriendsStore.focusingNow``. The list refreshes every
 * 60s as a poll fallback — WS push for friend.* + presence events is
 * planned for the buddy-realtime phase.
 */
export function FriendsNow() {
  const t = useTranslations("focus.solo.friendsNow");
  const focusingNow = useFriendsStore((s) => s.focusingNow);
  const setFocusingNow = useFriendsStore((s) => s.setFocusingNow);
  const [loading, setLoading] = useState(focusingNow.length === 0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await friendsApi.focusingNow();
        if (!cancelled) setFocusingNow(res.friends_focusing);
      } catch {
        /* leave the current list; transient errors shouldn't blank the UI */
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    const id = window.setInterval(load, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [setFocusingNow]);

  return (
    <div
      data-testid="friends-now"
      className="pixel-panel"
      style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span
          className="font-silkscreen"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontSize: 10,
            color: "var(--accent-2)",
            letterSpacing: "0.2em",
          }}
        >
          <span
            aria-hidden
            className="animate-blinkSoft"
            style={{
              width: 6,
              height: 6,
              background: "var(--accent-2)",
              boxShadow: "var(--neon-glow-pink)",
            }}
          />
          {t("header")}
        </span>
        <span
          className="font-silkscreen"
          style={{ fontSize: 9, color: "var(--ink-dim)", letterSpacing: "0.15em" }}
        >
          {t("onlineCount", { count: focusingNow.length })}
        </span>
      </div>

      {loading && focusingNow.length === 0 ? (
        <div
          className="font-silkscreen"
          style={{
            padding: "12px 8px",
            fontSize: 10,
            letterSpacing: "0.2em",
            color: "var(--ink-mute)",
            textAlign: "center",
          }}
        >
          ◌ {t("loading")}
        </div>
      ) : focusingNow.length === 0 ? (
        <div
          className="font-silkscreen"
          style={{
            padding: "12px 8px",
            fontSize: 10,
            letterSpacing: "0.16em",
            color: "var(--ink-mute)",
            lineHeight: 1.7,
            textAlign: "center",
          }}
        >
          {t("emptyState")}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {focusingNow.map((f) => (
            <FriendRow key={f.user_id} friend={f} />
          ))}
        </div>
      )}
    </div>
  );
}

function FriendRow({ friend }: { friend: FocusingNowItem }) {
  const t = useTranslations("focus.solo.friendsNow");
  const avatar = characterKeyToAvatar(friend.character_key);
  const minutes = minutesSince(friend.started_at);
  return (
    <div
      data-testid="friends-now-row"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "3px 6px",
        background: "rgba(0,0,0,0.3)",
        border: "1px solid var(--panel-stroke)",
      }}
    >
      <div style={{ position: "relative", flexShrink: 0 }}>
        <PixelSprite sprite={avatar.sprite} palette={avatar.palette} scale={1.4} />
        <span
          aria-hidden
          style={{
            position: "absolute",
            bottom: 0,
            right: 0,
            width: 6,
            height: 6,
            background: "#6ee7b7",
            border: "1px solid var(--bg-0)",
          }}
        />
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 0,
          flex: 1,
          minWidth: 0,
        }}
      >
        <span
          className="font-silkscreen"
          style={{ fontSize: 10, color: "var(--ink)", letterSpacing: "0.08em" }}
        >
          {friend.display_name}
        </span>
        <span
          className="font-silkscreen"
          style={{ fontSize: 8, color: "var(--accent-3)", letterSpacing: "0.1em" }}
        >
          🔋 {minutes}m
        </span>
      </div>
      <button
        type="button"
        className="pixel-btn primary"
        style={{ fontSize: 9, padding: "3px 6px" }}
      >
        {t("joinCta")}
      </button>
    </div>
  );
}
