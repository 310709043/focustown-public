"use client";

import Link from "next/link";

export default function SplashPage() {
  return (
    <main
      className="absolute inset-0 flex flex-col items-center justify-center text-center"
      style={{
        background:
          "radial-gradient(ellipse at 50% 40%,#1a0a6e 0%,#09023a 45%,#030111 100%)",
      }}
    >
      <div className="relative animate-fadeUp flex flex-col items-center gap-3">
        <div
          className="w-[74px] h-[74px] rounded-full animate-moonPulse"
          style={{
            background: "radial-gradient(circle at 33% 28%,#fff9c4,#fef3c7,#fcd34d)",
          }}
        />
        <div
          className="font-pixel tracking-[3px] leading-loose"
          style={{
            color: "var(--a2)",
            textShadow: "0 0 14px var(--a1), 0 0 35px var(--a3)",
            fontSize: "clamp(10px,2.6vw,14px)",
          }}
        >
          ✦ FOCUS TOWN ✦
        </div>
        <div className="text-[12px] text-muted tracking-widest">找你的人・找你的專注</div>
        <div className="flex gap-3 mt-1 text-[20px]">
          <span>🐱</span>
          <span>🦊</span>
          <span>🌸</span>
          <span>🐸</span>
          <span>🦋</span>
        </div>
        <Link
          href="/signin"
          className="font-pixel text-[8px] tracking-widest border-2 border-accent-1 text-accent-1 px-7 py-3 rounded mt-2 hover:border-accent-2 hover:text-accent-2"
        >
          ENTER TOWN ▶
        </Link>
        <Link href="/signup" className="text-[10px] text-muted hover:text-accent-2">
          還沒有帳號？立即註冊
        </Link>
      </div>
    </main>
  );
}
