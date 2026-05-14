"use client";

import { useState } from "react";
import Link from "next/link";
import { authApi } from "@/lib/api/endpoints";
import { ApiError } from "@/lib/api/client";
import { forgotPasswordSchema } from "@/lib/validation/auth";
import { AppFooter } from "@/components/AppFooter";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "請輸入有效 email");
      return;
    }
    setSubmitting(true);
    try {
      await authApi.forgotPassword({ email: parsed.data.email });
      setSubmitted(true);
    } catch (e) {
      // Even on backend error, present a generic message to avoid enumeration.
      if (e instanceof ApiError && e.status === 429) {
        setError("請求過於頻繁，請稍後再試。");
      } else {
        setSubmitted(true);
      }
    } finally {
      setSubmitting(false);
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
      <div className="bg-card border border-border rounded-lg p-6 w-full max-w-sm">
        <h1
          className="font-pixel text-[10px] tracking-widest text-center mb-3"
          style={{ color: "var(--a2)", textShadow: "0 0 10px var(--a1)" }}
        >
          ✦ 忘記密碼 ✦
        </h1>

        {submitted ? (
          <div className="text-[12px] text-text leading-relaxed">
            <p className="mb-2">
              如果該 email 已註冊，重設密碼的連結已寄出，請至信箱查收。
            </p>
            <p className="text-muted text-[10px] mb-4">
              連結將於 1 小時後失效。若未收到，請檢查垃圾郵件夾或稍後再試。
            </p>
            <Link
              href="/signin"
              className="block text-[10px] text-accent-2 hover:text-accent-1 text-center"
            >
              ← 返回登入
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            <p className="text-[11px] text-muted mb-1">
              輸入您的帳號 email，我們將寄送重設密碼的連結。
            </p>
            <input
              type="email"
              required
              placeholder="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bg-[rgba(12,5,35,.9)] border border-border rounded text-[12px] px-3 py-2 outline-none focus:border-accent-1"
              autoComplete="email"
            />
            {error ? (
              <div className="text-[11px] text-coral">{error}</div>
            ) : null}
            <button
              type="submit"
              disabled={submitting}
              className="font-pixel text-[8px] border-2 border-accent-1 text-accent-1 py-2.5 rounded hover:border-accent-2 disabled:opacity-50"
            >
              {submitting ? "寄送中..." : "寄送重設連結 ▶"}
            </button>
            <Link
              href="/signin"
              className="text-[10px] text-muted hover:text-accent-2 text-center"
            >
              返回登入
            </Link>
          </form>
        )}
      </div>
      <AppFooter />
    </main>
  );
}
