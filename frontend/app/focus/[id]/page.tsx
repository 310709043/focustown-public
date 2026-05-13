"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/state/authStore";
import { FocusTimer } from "@/components/focus-room/FocusTimer";
import { NotesPanel } from "@/components/focus-room/NotesPanel";
import { ChatPanel } from "@/components/focus-room/ChatPanel";
import { StarsLayer } from "@/components/scene/StarsLayer";

export default function FocusRoomPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, hydrate } = useAuthStore();
  const [paired] = useState<boolean>(id !== "solo");

  useEffect(() => {
    if (!user) void hydrate();
  }, [user, hydrate]);

  return (
    <main
      className="absolute inset-0 flex flex-col overflow-hidden"
      style={{ background: "linear-gradient(135deg,#04011a,#090230,#04011a)" }}
    >
      <div className="absolute inset-0 pointer-events-none">
        <StarsLayer />
      </div>
      <header className="h-[46px] bg-[rgba(3,1,17,.96)] border-b border-border flex items-center justify-between px-4 relative z-10">
        <div
          className="font-pixel text-[9px] tracking-wider"
          style={{ color: "var(--a2)", textShadow: "0 0 8px var(--a1)" }}
        >
          ✦ {paired ? "共同專注" : "Solo 專注模式"}
        </div>
        <button
          onClick={() => router.push("/town")}
          className="border border-border text-muted font-japan text-[10px] px-3 py-1 rounded hover:border-coral hover:text-coral"
        >
          ✕ 退出全屏
        </button>
      </header>
      <div
        className={`flex-1 grid ${paired ? "grid-cols-[1fr_360px]" : "grid-cols-[1fr_340px]"} min-h-0 relative z-[2]`}
      >
        <FocusTimer partnerId={paired ? id : null} />
        <aside className="border-l border-border flex flex-col">
          {paired && user ? <ChatPanel roomId={id} myUserId={user.id} /> : <NotesPanel />}
        </aside>
      </div>
    </main>
  );
}
