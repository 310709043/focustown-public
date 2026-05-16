"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import type { AvatarDef } from "@/lib/pixel/sprites/avatars";

import { MessageView, type ChatMessage } from "./Message";

const SEED: ReadonlyArray<ChatMessage> = [
  { id: "s1", kind: "sys", text: "ROOM #2847-A 已建立 · 你和 Aria 都同意一起寫作 25 min" },
  { id: "m1", kind: "chat", who: "buddy", text: "嗨～我打算第七章寫完，你呢？", time: "21:25" },
  { id: "m2", kind: "chat", who: "me", text: "我寫 PRD，預計兩個番茄解決", time: "21:25" },
  {
    id: "m3",
    kind: "note",
    who: "buddy",
    text: "## 共同筆記\n- 25min 後互相唸給對方聽 ✓\n- 不開鏡頭、只開麥",
    time: "21:26",
  },
  { id: "s2", kind: "sys", text: "🍅 第 1 顆番茄開始 · 不要分心喔" },
  { id: "m4", kind: "chat", who: "me", text: "開工！加油 ✦", time: "21:27" },
  { id: "m5", kind: "chat", who: "buddy", text: "✦", time: "21:27" },
  { id: "s3", kind: "sys", text: "🍅 第 1 顆番茄完成 · 你們都堅持下來了 +5 T 幣" },
];

interface ChatStreamProps {
  meAvatar: AvatarDef;
  buddyAvatar: AvatarDef;
  meName: string;
  buddyName: string;
}

/**
 * Buddy-room chat stream. UI-only this PR per Phase E plan — no real
 * WebSocket wiring yet; seed messages match reference's hardcoded
 * onboarding sequence. The composer's "send" appends to local state.
 *
 * Reference: screen-buddy.jsx:L316-L419.
 */
export function ChatStream({
  meAvatar,
  buddyAvatar,
  meName,
  buddyName,
}: ChatStreamProps) {
  const t = useTranslations("focus.buddy.chat");
  const [messages, setMessages] = useState<ChatMessage[]>([...SEED]);
  const [input, setInput] = useState("");
  const [type, setType] = useState<"chat" | "note">("chat");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  const send = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    setMessages((prev) => [
      ...prev,
      { id: `local-${Date.now()}`, kind: type, who: "me", text: trimmed, time },
    ]);
    setInput("");
  };

  const modeBtnStyle = (active: boolean) =>
    ({
      padding: "4px 10px",
      fontSize: 10,
      fontFamily: "var(--font-silkscreen), monospace",
      background: active ? "var(--accent)" : "rgba(0,0,0,0.4)",
      color: active ? "#0a0524" : "var(--ink-mute)",
      border: `1px solid ${active ? "var(--accent)" : "var(--panel-stroke)"}`,
      letterSpacing: "0.1em",
      cursor: "pointer",
    }) as const;

  return (
    <>
      <div
        ref={scrollRef}
        data-testid="chat-stream"
        style={{
          flex: 1,
          overflowY: "auto",
          padding: 14,
          display: "flex",
          flexDirection: "column",
          gap: 10,
          background: "rgba(7,4,26,0.3)",
        }}
      >
        {messages.map((m) => (
          <MessageView
            key={m.id}
            msg={m}
            meAvatar={meAvatar}
            buddyAvatar={buddyAvatar}
            meName={meName}
            buddyName={buddyName}
            noteLabel={t("noteLabel")}
          />
        ))}
      </div>
      <div
        style={{
          borderTop: "1px solid var(--panel-stroke)",
          padding: 10,
          display: "flex",
          flexDirection: "column",
          gap: 6,
          background: "rgba(7,4,26,0.6)",
        }}
      >
        <div style={{ display: "flex", gap: 6 }}>
          <button
            type="button"
            data-testid="chat-mode-chat"
            onClick={() => setType("chat")}
            style={modeBtnStyle(type === "chat")}
          >
            💬 {t("modeChat")}
          </button>
          <button
            type="button"
            data-testid="chat-mode-note"
            onClick={() => setType("note")}
            style={modeBtnStyle(type === "note")}
          >
            ✎ {t("modeNote")}
          </button>
          <button type="button" style={modeBtnStyle(false)} aria-label={t("attachAria")}>
            📎 {t("attach")}
          </button>
          <button type="button" style={modeBtnStyle(false)} aria-label={t("shareMusicAria")}>
            🎵 {t("shareMusic")}
          </button>
          <div style={{ flex: 1 }} />
          <button type="button" style={modeBtnStyle(false)} aria-label={t("pauseAria")}>
            🍅 {t("pause")}
          </button>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <input
            data-testid="chat-input"
            className="pixel-input"
            placeholder={t("typeMsg")}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            style={{ flex: 1, fontSize: 12 }}
          />
          <button
            type="button"
            data-testid="chat-send"
            onClick={send}
            className="pixel-btn primary"
            style={{ padding: "0 18px" }}
          >
            →
          </button>
        </div>
      </div>
    </>
  );
}
