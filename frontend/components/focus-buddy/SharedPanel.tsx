"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import type { AvatarDef } from "@/lib/pixel/sprites/avatars";

import { ChatStream } from "./ChatStream";
import { NotesStream } from "./NotesStream";
import { TabBtn } from "./TabBtn";

type Tab = "chat" | "notes";

interface SharedPanelProps {
  matchId: string;
  meAvatar: AvatarDef;
  buddyAvatar: AvatarDef;
  meName: string;
  buddyName: string;
}

/**
 * Right-column container for the buddy room — `pixel-panel` with tab
 * toggle (`💬 chat / ✎ notes`) + LIVE status hint, hosting either
 * `<ChatStream>` or `<NotesStream>`. Reference: screen-buddy.jsx:L281-L301.
 */
export function SharedPanel({
  matchId,
  meAvatar,
  buddyAvatar,
  meName,
  buddyName,
}: SharedPanelProps) {
  const t = useTranslations("focus.buddy.sharedPanel");
  const [tab, setTab] = useState<Tab>("chat");
  return (
    <div
      data-testid="shared-panel"
      className="pixel-panel"
      style={{
        padding: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 14px",
          borderBottom: "1px solid var(--panel-stroke)",
          background: "rgba(7,4,26,0.5)",
        }}
      >
        <div style={{ display: "flex", gap: 6 }}>
          <TabBtn active={tab === "chat"} onClick={() => setTab("chat")}>
            💬 {t("chatTab")}
          </TabBtn>
          <TabBtn active={tab === "notes"} onClick={() => setTab("notes")}>
            ✎ {t("notesTab")}
          </TabBtn>
        </div>
        <div
          className="font-silkscreen"
          style={{
            display: "flex",
            gap: 6,
            fontSize: 9,
            color: "var(--ink-dim)",
            letterSpacing: "0.15em",
          }}
        >
          <span>● {t("liveLabel")}</span>
          <span>·</span>
          <span>{t("onlineCount", { count: 2 })}</span>
        </div>
      </div>
      {tab === "chat" ? (
        <ChatStream
          meAvatar={meAvatar}
          buddyAvatar={buddyAvatar}
          meName={meName}
          buddyName={buddyName}
        />
      ) : (
        <NotesStream matchId={matchId} />
      )}
    </div>
  );
}
