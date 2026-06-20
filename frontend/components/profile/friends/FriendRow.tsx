"use client";

import { useTranslations } from "next-intl";

import type { FriendSummary } from "@/lib/api/endpoints";
import { usePresenceStore } from "@/lib/state/presenceStore";
import { pushInfoToast } from "@/lib/state/toastStore";

interface FriendRowProps {
  friend: FriendSummary;
  tab: "friends" | "incoming" | "outgoing";
  onAccept: () => void;
  onReject: () => void;
  onUnfriend: () => void;
  /** Open the gift dialog with this friend's user_id pre-filled.
   *  Only meaningful on the `friends` tab (accepted friendships). */
  onGift?: () => void;
}

export function FriendRow({
  friend,
  tab,
  onAccept,
  onReject,
  onUnfriend,
  onGift,
}: FriendRowProps) {
  const t = useTranslations("profile.friends");
  const byId = usePresenceStore((s) => s.byId);
  const isOnline = Boolean(byId[friend.user_id]);

  return (
    <li
      data-testid="friend-row"
      className="pixel-panel"
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: 10,
        padding: "10px 12px",
        background: "rgba(20,10,55,0.4)",
        alignItems: "center",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginBottom: 2,
          }}
        >
          {isOnline && (
            <span
              aria-label="online"
              style={{
                display: "inline-block",
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#4ade80",
                boxShadow: "0 0 6px #4ade80",
                flexShrink: 0,
              }}
            />
          )}
          <span
            className="font-silkscreen"
            style={{
              fontSize: 12,
              letterSpacing: "0.14em",
              color: "var(--ink)",
            }}
          >
            {friend.display_name}
          </span>
        </div>
        <div
          className="font-silkscreen"
          style={{
            fontSize: 9,
            letterSpacing: "0.22em",
            color: "var(--ink-mute)",
          }}
        >
          {friend.character_key ?? "—"} · {friend.user_id.slice(0, 8)}
          {isOnline && (
            <span style={{ color: "#4ade80", marginLeft: 6 }}>● ONLINE</span>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 6 }}>
        {tab === "incoming" ? (
          <>
            <button
              type="button"
              onClick={onAccept}
              className="font-silkscreen"
              style={{
                padding: "5px 12px",
                fontSize: 10,
                letterSpacing: "0.2em",
                color: "#0c0524",
                background: "var(--accent-2)",
                border: "1px solid var(--accent-2)",
                cursor: "pointer",
              }}
            >
              {t("actionAccept")}
            </button>
            <button
              type="button"
              onClick={onReject}
              className="font-silkscreen"
              style={{
                padding: "5px 12px",
                fontSize: 10,
                letterSpacing: "0.2em",
                color: "#f472b6",
                background: "rgba(20,10,55,0.65)",
                border: "1px solid var(--panel-stroke)",
                cursor: "pointer",
              }}
            >
              {t("actionReject")}
            </button>
          </>
        ) : tab === "outgoing" ? (
          <button
            type="button"
            onClick={onReject}
            className="font-silkscreen"
            style={{
              padding: "5px 12px",
              fontSize: 10,
              letterSpacing: "0.2em",
              color: "var(--ink-mute)",
              background: "rgba(20,10,55,0.65)",
              border: "1px solid var(--panel-stroke)",
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        ) : (
          <>
            {isOnline ? (
              <button
                type="button"
                data-testid="friend-row-invite"
                className="font-silkscreen"
                onClick={() =>
                  pushInfoToast(`已向 ${friend.display_name} 發送邀請！`)
                }
                style={{
                  padding: "5px 10px",
                  fontSize: 9,
                  letterSpacing: "0.18em",
                  color: "#4ade80",
                  background: "rgba(20,10,55,0.65)",
                  border: "1px solid #4ade80",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                ✦ 邀請
              </button>
            ) : null}
            {onGift ? (
              <button
                type="button"
                onClick={onGift}
                data-testid="friend-row-gift"
                className="font-silkscreen"
                style={{
                  padding: "5px 12px",
                  fontSize: 10,
                  letterSpacing: "0.2em",
                  color: "var(--amber)",
                  background: "rgba(20,10,55,0.65)",
                  border: "1px solid var(--amber)",
                  cursor: "pointer",
                }}
              >
                {t("actionGift")}
              </button>
            ) : null}
            <button
              type="button"
              onClick={onUnfriend}
              className="font-silkscreen"
              style={{
                padding: "5px 12px",
                fontSize: 10,
                letterSpacing: "0.2em",
                color: "var(--ink-mute)",
                background: "rgba(20,10,55,0.65)",
                border: "1px solid var(--panel-stroke)",
                cursor: "pointer",
              }}
            >
              {t("actionUnfriend")}
            </button>
          </>
        )}
      </div>
    </li>
  );
}
