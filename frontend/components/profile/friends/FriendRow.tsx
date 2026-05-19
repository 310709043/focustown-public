"use client";

import { useTranslations } from "next-intl";

import type { FriendSummary } from "@/lib/api/endpoints";

interface FriendRowProps {
  friend: FriendSummary;
  tab: "friends" | "incoming" | "outgoing";
  onAccept: () => void;
  onReject: () => void;
  onUnfriend: () => void;
}

export function FriendRow({
  friend,
  tab,
  onAccept,
  onReject,
  onUnfriend,
}: FriendRowProps) {
  const t = useTranslations("profile.friends");

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
          className="font-silkscreen"
          style={{
            fontSize: 12,
            letterSpacing: "0.14em",
            color: "var(--ink)",
            marginBottom: 2,
          }}
        >
          {friend.display_name}
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
        )}
      </div>
    </li>
  );
}
