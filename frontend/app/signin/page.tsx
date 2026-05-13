"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/lib/state/authStore";

export default function SignInPage() {
  const router = useRouter();
  const { signIn, loading, error } = useAuthStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await signIn(email, password);
      router.push("/town");
    } catch {
      /* error already in store */
    }
  };

  return (
    <main
      className="absolute inset-0 flex items-center justify-center p-6"
      style={{
        background:
          "linear-gradient(155deg,#060120 0%,#0d0435 55%,#060120 100%)",
      }}
    >
      <form onSubmit={onSubmit} className="bg-card border border-border rounded-lg p-6 w-full max-w-sm flex flex-col gap-3">
        <h1
          className="font-pixel text-[10px] tracking-widest text-center mb-2"
          style={{ color: "var(--a2)", textShadow: "0 0 10px var(--a1)" }}
        >
          ✦ 登入 ✦
        </h1>
        <input
          type="email"
          required
          placeholder="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="bg-[rgba(12,5,35,.9)] border border-border rounded text-[12px] px-3 py-2 outline-none focus:border-accent-1"
        />
        <input
          type="password"
          required
          minLength={8}
          placeholder="密碼 (至少 8 字)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="bg-[rgba(12,5,35,.9)] border border-border rounded text-[12px] px-3 py-2 outline-none focus:border-accent-1"
        />
        {error ? <div className="text-[11px] text-coral">{error}</div> : null}
        <button
          type="submit"
          disabled={loading}
          className="font-pixel text-[8px] border-2 border-accent-1 text-accent-1 py-2.5 rounded hover:border-accent-2 disabled:opacity-50"
        >
          {loading ? "登入中..." : "進入小鎮 ▶"}
        </button>
        <Link href="/signup" className="text-[10px] text-muted hover:text-accent-2 text-center">
          還沒有帳號？立即註冊
        </Link>
      </form>
    </main>
  );
}
