"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { ApiError } from "@/lib/api/client";
import { matchChatApi, type MatchChatMessage } from "@/lib/api/endpoints";
import { useAuthStore } from "@/lib/state/authStore";
import { pushErrorToast } from "@/lib/state/toastStore";
import { useRealtime } from "@/lib/ws/useRealtime";
import type { AvatarDef } from "@/lib/pixel/sprites/avatars";

import { MessageView, type ChatMessage } from "./Message";

interface ChatStreamProps {
  matchId: string;
  meAvatar: AvatarDef;
  buddyAvatar: AvatarDef;
  meName: string;
  buddyName: string;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function toChatMessage(
  raw: MatchChatMessage,
  meId: string | null,
): ChatMessage {
  if (raw.kind === "system") {
    return { id: raw.id, kind: "sys", text: raw.body };
  }
  const who = meId && raw.sender_id === meId ? "me" : "buddy";
  if (raw.kind === "note_share") {
    return {
      id: raw.id,
      kind: "note",
      who,
      text: raw.body,
      time: formatTime(raw.created_at),
    };
  }
  return {
    id: raw.id,
    kind: "chat",
    who,
    text: raw.body,
    time: formatTime(raw.created_at),
  };
}

/**
 * Buddy-room chat stream. Backed by /api/v1/matches/{id}/messages:
 * initial scrollback comes from REST; new messages arrive via the
 * Redis-fanned-out `chat.message` WS event on the room channel.
 */
export function ChatStream({
  matchId,
  meAvatar,
  buddyAvatar,
  meName,
  buddyName,
}: ChatStreamProps) {
  const t = useTranslations("focus.buddy.chat");
  const meId = useAuthStore((s) => s.user?.id ?? null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [type, setType] = useState<"chat" | "note">("chat");
  const scrollRef = useRef<HTMLDivElement>(null);

  const reload = useCallback(async () => {
    try {
      const res = await matchChatApi.list(matchId);
      // Phase 02: shape is ``{ items, next_cursor }`` instead of ``{ messages }``.
      const ordered = [...res.items].sort(
        (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at),
      );
      setMessages(ordered.map((m) => toChatMessage(m, meId)));
    } catch {
      pushErrorToast(t("loadError"));
    }
  }, [matchId, meId, t]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useRealtime((msg) => {
    const payload = msg as {
      type?: string;
      match_id?: string;
      id?: string;
      sender_id?: string;
      kind?: MatchChatMessage["kind"];
      body?: string;
      metadata?: Record<string, unknown> | null;
      created_at?: string;
    };
    if (
      payload?.type !== "chat.message" ||
      payload.match_id !== matchId ||
      !payload.id ||
      !payload.body
    ) {
      return;
    }
    const incoming: MatchChatMessage = {
      id: payload.id,
      match_id: matchId,
      sender_id: payload.sender_id ?? "",
      kind: (payload.kind ?? "text") as MatchChatMessage["kind"],
      body: payload.body,
      metadata: payload.metadata ?? null,
      created_at: payload.created_at ?? new Date().toISOString(),
    };
    setMessages((prev) => {
      if (prev.some((m) => m.id === incoming.id)) return prev;
      return [...prev, toChatMessage(incoming, meId)];
    });
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  const send = async () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    setInput("");
    try {
      await matchChatApi.send(matchId, trimmed, {
        kind: type === "note" ? "note_share" : "text",
      });
      // The WS push appends the canonical row; nothing more to do.
    } catch (err) {
      pushErrorToast(
        err instanceof ApiError ? err.message : t("sendError"),
      );
      setInput(trimmed);
    }
  };

  const modeBtnStyle = (active: boolean) =>
    ({
      padding: "5px 12px",
      fontSize: 10,
      fontFamily: "var(--font-silkscreen), monospace",
      background: active
        ? "linear-gradient(180deg, rgba(233, 167, 110, 0.2) 0%, rgba(233, 167, 110, 0.1) 100%)"
        : "rgba(0, 0, 0, 0.3)",
      color: active ? "var(--a1)" : "var(--dim)",
      border: `1px solid ${active ? "var(--a1-soft)" : "var(--border)"}`,
      borderRadius: "var(--r)",
      letterSpacing: "0.1em",
      cursor: "pointer",
      transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
      backdropFilter: "blur(4px)",
      WebkitBackdropFilter: "blur(4px)",
    }) as const;

  return (
    <>
      <div
        ref={scrollRef}
        data-testid="chat-stream"
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          background: "rgba(12, 16, 32, 0.4)",
          borderRadius: "var(--r2) var(--r2) 0 0",
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
          borderTop: "1px solid var(--glass-border)",
          padding: "12px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          background: "rgba(12, 16, 32, 0.7)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          borderRadius: "0 0 var(--r2) var(--r2)",
        }}
      >
        <div style={{ display: "flex", gap: 8 }}>
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
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            data-testid="chat-input"
            className="pixel-input"
            placeholder={t("typeMsg")}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            style={{ flex: 1, fontSize: 13, borderRadius: "var(--r)" }}
          />
          <button
            type="button"
            data-testid="chat-send"
            onClick={() => void send()}
            className="pixel-btn primary"
            style={{ padding: "0 20px", borderRadius: "var(--r)" }}
          >
            →
          </button>
        </div>
      </div>
    </>
  );
}
