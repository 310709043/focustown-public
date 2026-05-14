"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/lib/state/authStore";
import { PasswordInput } from "@/components/forms/PasswordInput";
import { AppFooter } from "@/components/AppFooter";

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
      className="absolute inset-0 flex flex-col items-center justify-center p-6"
      style={{
        background:
          "linear-gradient(155deg,#060120 0%,#0d0435 55%,#060120 100%)",
      }}
    >
      <form
        data-testid="signin-form"
        onSubmit={onSubmit}
        className="bg-card border border-border rounded-lg p-6 w-full max-w-sm flex flex-col gap-3"
      >
        <h1
          className="font-pixel text-[10px] tracking-widest text-center mb-2"
          style={{ color: "var(--a2)", textShadow: "0 0 10px var(--a1)" }}
        >
          ✦ 登入 ✦
        </h1>
        <input
          data-testid="signin-email"
          type="email"
          required
          placeholder="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="bg-[rgba(12,5,35,.9)] border border-border rounded text-[12px] px-3 py-2 outline-none focus:border-accent-1"
          autoComplete="email"
        />
        <PasswordInput
          data-testid="signin-password"
          required
          minLength={8}
          placeholder="密碼"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
        {error ? (
          <div
            data-testid="signin-error"
            role="alert"
            className="font-japan"
            style={{
              fontSize: 14,
              color: "#fecaca",
              background: "rgba(220,38,38,0.18)",
              border: "1px solid rgba(248,113,113,0.6)",
              borderRadius: 6,
              padding: "10px 12px",
              lineHeight: 1.4,
              textShadow: "0 0 6px rgba(248,113,113,0.8)",
              boxShadow: "0 0 18px rgba(220,38,38,0.25)",
            }}
          >
            <span style={{ fontSize: 16, marginRight: 6 }}>✗</span>
            {error}
          </div>
        ) : null}
        <button
          data-testid="signin-submit"
          type="submit"
          disabled={loading}
          className="font-pixel text-[8px] border-2 border-accent-1 text-accent-1 py-2.5 rounded hover:border-accent-2 disabled:opacity-50"
        >
          {loading ? "登入中..." : "進入小鎮 ▶"}
        </button>
        <div className="flex justify-between text-[10px]">
          <Link
            href="/signup"
            className="text-muted hover:text-accent-2"
          >
            還沒有帳號？立即註冊
          </Link>
          <Link
            href="/forgot-password"
            className="text-muted hover:text-accent-2"
          >
            忘記密碼？
          </Link>
        </div>
      </form>
      <AppFooter />
    </main>
  );
}
