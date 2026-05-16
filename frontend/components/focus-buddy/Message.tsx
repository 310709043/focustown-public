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
          color: "var(--ink-dim)",
          letterSpacing: "0.15em",
          padding: "4px 10px",
          background: "rgba(0,0,0,0.3)",
          border: "1px dashed var(--panel-stroke)",
        }}
      >
        {msg.text}
      </div>
    );
  }
  const isMe = msg.who === "me";
  const avatar = isMe ? meAvatar : buddyAvatar;
  const name = isMe ? meName : buddyName;
  const color = isMe ? "var(--accent)" : "var(--accent-2)";
  return (
    <div
      data-testid={`chat-msg-${msg.kind}`}
      style={{
        display: "flex",
        flexDirection: isMe ? "row-reverse" : "row",
        gap: 8,
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
          gap: 2,
        }}
      >
        <div
          className="font-silkscreen"
          style={{
            display: "flex",
            gap: 6,
            alignItems: "center",
            fontSize: 9,
            color: "var(--ink-mute)",
          }}
        >
          <span style={{ color }}>{name}</span>
          <span>·</span>
          <span>{msg.time}</span>
          {msg.kind === "note" ? (
            <span style={{ color: "var(--accent-3)" }}>{noteLabel}</span>
          ) : null}
        </div>
        <div
          style={{
            padding: msg.kind === "note" ? "8px 12px" : "6px 10px",
            background:
              msg.kind === "note"
                ? "rgba(34,211,238,0.08)"
                : isMe
                  ? "rgba(183,148,246,0.12)"
                  : "rgba(236,72,153,0.1)",
            border: `1px solid ${
              msg.kind === "note" ? "var(--accent-3)" : `${color}`
            }55`,
            fontFamily:
              msg.kind === "note"
                ? 'var(--font-vt323), "Noto Sans TC", monospace'
                : '"Noto Sans TC", sans-serif',
            fontSize: msg.kind === "note" ? 15 : 12,
            lineHeight: 1.5,
            color: "var(--ink)",
            whiteSpace: "pre-wrap",
          }}
        >
          {msg.text}
        </div>
      </div>
    </div>
  );
}
