"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { authApi } from "@/lib/api/endpoints";
import { ApiError } from "@/lib/api/client";
import { resetPasswordSchema, type ResetPasswordInput } from "@/lib/validation/auth";
import { PasswordInput } from "@/components/forms/PasswordInput";
import { AppFooter } from "@/components/AppFooter";

type FormErrors = Partial<Record<keyof ResetPasswordInput, string>>;

function ResetPasswordInner() {
  const router = useRouter();
  const search = useSearchParams();
  const token = search.get("token") ?? "";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <div className="text-[12px] text-text">
        <p className="mb-3">重設連結無效或已過期。</p>
        <Link
          href="/forgot-password"
          className="text-[10px] text-accent-2 hover:text-accent-1"
        >
          重新申請重設密碼 →
        </Link>
      </div>
    );
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setServerError(null);

    const parsed = resetPasswordSchema.safeParse({
      token,
      newPassword,
      confirmPassword,
    });
    if (!parsed.success) {
      const fieldErrors: FormErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof ResetPasswordInput;
        if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setSubmitting(true);
    try {
      await authApi.resetPassword({
        token,
        newPassword: parsed.data.newPassword,
      });
      setDone(true);
      setTimeout(() => router.push("/signin"), 1800);
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.code === "validation_error") {
          setServerError("連結已過期或已使用，請重新申請。");
        } else if (e.status === 429) {
          setServerError("請求過於頻繁，請稍後再試。");
        } else {
          setServerError(e.message || "重設失敗，請稍後再試。");
        }
      } else {
        setServerError("重設失敗，請稍後再試。");
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="text-[12px] text-text text-center">
        <p className="mb-3 text-accent-2">✓ 密碼已成功重設</p>
        <p className="text-[10px] text-muted">即將前往登入頁...</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <p className="text-[11px] text-muted mb-1">請輸入新密碼。</p>
      <div>
        <PasswordInput
          placeholder="新密碼 (8+ 字, 含英文與數字)"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          autoComplete="new-password"
        />
        {errors.newPassword ? (
          <p className="text-coral text-[10px] mt-0.5">{errors.newPassword}</p>
        ) : null}
      </div>
      <div>
        <PasswordInput
          placeholder="再次輸入新密碼"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
        />
        {errors.confirmPassword ? (
          <p className="text-coral text-[10px] mt-0.5">{errors.confirmPassword}</p>
        ) : null}
      </div>
      {serverError ? (
        <div className="text-[11px] text-coral">{serverError}</div>
      ) : null}
      <button
        type="submit"
        disabled={submitting}
        className="font-pixel text-[8px] border-2 border-accent-1 text-accent-1 py-2.5 rounded hover:border-accent-2 disabled:opacity-50"
      >
        {submitting ? "重設中..." : "重設密碼 ▶"}
      </button>
      <Link
        href="/signin"
        className="text-[10px] text-muted hover:text-accent-2 text-center"
      >
        返回登入
      </Link>
    </form>
  );
}

export default function ResetPasswordPage() {
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
          ✦ 重設密碼 ✦
        </h1>
        <Suspense fallback={<div className="text-[11px] text-muted">載入中...</div>}>
          <ResetPasswordInner />
        </Suspense>
      </div>
      <AppFooter />
    </main>
  );
}
