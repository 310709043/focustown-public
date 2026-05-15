"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRealtime } from "@/lib/ws/useRealtime";

type Msg = { from: "me" | "them"; text: string; ts: string };

export function ChatPanel({ roomId, myUserId }: { roomId: string; myUserId: string }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const t = useTranslations("focus.chat");

  const realtime = useRealtime((msg) => {
    if (msg.type !== "chat" || msg.room_id !== roomId) return;
    if (msg.from === myUserId) return; // we already optimistic-rendered
    // WsMessage's "chat" variant carries a string text, but the union widens
    // it via the index-signature fallback — narrow explicitly here.
    const text = typeof msg.text === "string" ? msg.text : String(msg.text ?? "");
    setMsgs((prev) => [...prev, { from: "them", text, ts: nowStr() }]);
  });

  useEffect(() => {
    realtime.send({ type: "join", room_id: roomId });
  }, [realtime, roomId]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [msgs.length]);

  const send = () => {
    const text = input.trim();
    if (!text) return;
    realtime.send({ type: "chat", room_id: roomId, text });
    setMsgs((prev) => [...prev, { from: "me", text, ts: nowStr() }]);
    setInput("");
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-[rgba(5,1,20,.6)] backdrop-blur-md">
      <div className="px-3.5 py-2.5 border-b border-border text-[10px] text-muted">
        {t("header", { roomId: roomId.slice(0, 6) })}
      </div>
      <div ref={listRef} className="flex-1 overflow-y-auto p-3.5 flex flex-col gap-2 min-h-0">
        {msgs.map((m, i) => (
          <div
            key={i}
            className={`max-w-[85%] ${m.from === "me" ? "self-end" : "self-start"}`}
          >
            <div
              className={`px-3 py-1.5 text-[12px] leading-snug rounded font-body ${
                m.from === "me"
                  ? "bg-accent-3/20 border border-accent-1/30 text-accent-2"
                  : "bg-[rgba(30,20,60,.7)] border border-border"
              }`}
            >
              {m.text}
            </div>
            <div className={`text-[9px] text-muted mt-0.5 ${m.from === "me" ? "text-right" : ""}`}>
              {m.ts}
            </div>
          </div>
        ))}
      </div>
      <div className="px-3.5 py-2.5 border-t border-border flex gap-1.5">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder={t("placeholder")}
          className="flex-1 bg-[rgba(12,5,35,.9)] border border-border rounded text-[12px] px-3 py-2 outline-none focus:border-accent-1"
        />
        <button
          onClick={send}
          className="bg-transparent border border-accent-1 text-accent-1 text-[12px] px-3 py-1.5 rounded hover:bg-accent-1/10"
        >
          {t("sendCta")}
        </button>
      </div>
    </div>
  );
}

function nowStr() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
