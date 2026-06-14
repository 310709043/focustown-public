"use client";

import { PixelSprite } from "@/components/pixel/PixelSprite";
import type { AvatarDef } from "@/lib/pixel/sprites/avatars";

/**
 * Discriminated union for ChatStream messages — `sys` (system banner),
 * `chat` (regular bubble), `note` (cyan-bordered VT323 long-form).
 * Each variant renders distinct chrome; LSP — any consumer accepting
 * `Message` can hand off to `<MessageView>` without knowing which kind.
 */
export type ChatMessage =
  | { kind: "sys"; text: string; id: string }
  | {
      kind: "chat" | "note";
      who: "me" | "buddy";
      text: string;
      time: string;
      id: string;
    };

interface MessageViewProps {
  msg: ChatMessage;
  meAvatar: AvatarDef;
  buddyAvatar: AvatarDef;
  meName: string;
  buddyName: string;
  noteLabel: string;
}

export function MessageView({
  msg,
  meAvatar,
  buddyAvatar,
  meName,
  buddyName,
  noteLabel,
}: MessageViewProps) {
  if (msg.kind === "sys") {
    return (
      <div
        data-testid="chat-msg-sys"
        className="font-silkscreen"
        style={{
          alignSelf: "center",
          fontSize: 9,
          color: "var(--dim)",
          letterSpacing: "0.15em",
          padding: "5px 14px",
          background: "rgba(12, 16, 32, 0.6)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
        }}
      >
        {msg.text}
      </div>
    );
  }
  const isMe = msg.who === "me";
  const avatar = isMe ? meAvatar : buddyAvatar;
  const name = isMe ? meName : buddyName;
  const color = isMe ? "var(--a1)" : "var(--accent-2)";
  return (
    <div
      data-testid={`chat-msg-${msg.kind}`}
      style={{
        display: "flex",
        flexDirection: isMe ? "row-reverse" : "row",
        gap: 10,
        alignItems: "flex-start",
      }}
    >
      <PixelSprite sprite={avatar.sprite} palette={avatar.palette} scale={1.6} />
      <div
        style={{
          maxWidth: "78%",
          display: "flex",
          flexDirection: "column",
          alignItems: isMe ? "flex-end" : "flex-start",
          gap: 3,
        }}
      >
        <div
          className="font-silkscreen"
          style={{
            display: "flex",
            gap: 6,
            alignItems: "center",
            fontSize: 9,
            color: "var(--dim)",
          }}
        >
          <span style={{ color }}>{name}</span>
          <span style={{ opacity: 0.4 }}>·</span>
          <span>{msg.time}</span>
          {msg.kind === "note" ? (
            <span style={{ color: "var(--accent-3)", opacity: 0.8 }}>{noteLabel}</span>
          ) : null}
        </div>
        <div
          style={{
            padding: msg.kind === "note" ? "10px 14px" : "8px 12px",
            background:
              msg.kind === "note"
                ? "rgba(145, 168, 196, 0.08)"
                : isMe
                  ? "linear-gradient(135deg, rgba(233, 167, 110, 0.12) 0%, rgba(233, 167, 110, 0.06) 100%)"
                  : "rgba(12, 16, 32, 0.5)",
            border: `1px solid ${
              msg.kind === "note" ? "var(--a4-soft)" : `${color}30`
            }`,
            borderRadius: "var(--r)",
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
            fontFamily:
              msg.kind === "note"
                ? 'var(--font-vt323), "Noto Sans TC", monospace'
                : '"Noto Sans TC", sans-serif',
            fontSize: msg.kind === "note" ? 15 : 13,
            lineHeight: 1.6,
            color: "var(--text)",
            whiteSpace: "pre-wrap",
          }}
        >
          {msg.text}
        </div>
      </div>
    </div>
  );
}
