"use client";

import { useState } from "react";
import { Link, useRouter } from "@/i18n/routing";
import { useAuthStore } from "@/lib/state/authStore";
import { signUpSchema, type SignUpInput } from "@/lib/validation/auth";
import { PasswordInput } from "@/components/forms/PasswordInput";
import { Checkbox } from "@/components/forms/Checkbox";
import { AppFooter } from "@/components/AppFooter";
import { LEGAL } from "@/lib/config/legal";

type FormErrors = Partial<Record<keyof SignUpInput, string>>;

export default function SignUpPage() {
  const router = useRouter();
  const { signUp, loading, error } = useAuthStore();
  const [form, setForm] = useState<SignUpInput>({
    displayName: "",
    email: "",
    password: "",
    termsAccepted: false,
    marketingOptIn: false,
  });
  const [errors, setErrors] = useState<FormErrors>({});

  const update = <K extends keyof SignUpInput>(key: K, value: SignUpInput[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = signUpSchema.safeParse(form);
    if (!parsed.success) {
      const fieldErrors: FormErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof SignUpInput;
        if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    try {
      await signUp({
        email: parsed.data.email,
        password: parsed.data.password,
        displayName: parsed.data.displayName,
        termsVersion: LEGAL.termsVersion,
        marketingOptIn: parsed.data.marketingOptIn,
      });
      router.push("/select-character");
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
        data-testid="signup-form"
        onSubmit={onSubmit}
        className="pixel-panel p-6 w-full max-w-sm flex flex-col gap-3"
      >
        <div
          aria-hidden
          className="font-pixel text-[10px] tracking-widest text-center opacity-80"
          style={{ color: "var(--a2)", textShadow: "0 0 10px var(--a1)" }}
        >
          ✦ FOCUS TOWN ✦
        </div>
        <h1
          className="text-center mb-2"
          style={{
            fontSize: "var(--font-size-section-title)",
            lineHeight: "var(--line-height-title)",
            fontWeight: 500,
            color: "var(--text)",
            textShadow: "0 0 18px rgba(167,139,250,0.35)",
          }}
        >
          加入 Focus Town
        </h1>

        <div>
          <input
            data-testid="signup-name"
            placeholder="顯示名稱"
            value={form.displayName}
            onChange={(e) => update("displayName", e.target.value)}
            className="pixel-input"
            style={{ fontSize: "var(--font-size-body)", lineHeight: 1.4 }}
            autoComplete="nickname"
          />
          {errors.displayName ? (
            <p
              className="text-coral mt-1"
              style={{ fontSize: "var(--font-size-note)" }}
            >
              {errors.displayName}
            </p>
          ) : null}
        </div>

        <div>
          <input
            data-testid="signup-email"
            type="email"
            placeholder="email"
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
            className="pixel-input"
            style={{ fontSize: "var(--font-size-body)", lineHeight: 1.4 }}
            autoComplete="email"
          />
          {errors.email ? (
            <p
              className="text-coral mt-1"
              style={{ fontSize: "var(--font-size-note)" }}
            >
              {errors.email}
            </p>
          ) : null}
        </div>

        <div>
          <PasswordInput
            data-testid="signup-password"
            placeholder="密碼 (8+ 字, 含英文與數字)"
            value={form.password}
            onChange={(e) => update("password", e.target.value)}
            autoComplete="new-password"
          />
          {errors.password ? (
            <p
              className="text-coral mt-1"
              style={{ fontSize: "var(--font-size-note)" }}
            >
              {errors.password}
            </p>
          ) : null}
        </div>

        <Checkbox
          data-testid="signup-terms"
          checked={form.termsAccepted}
          onChange={(e) => update("termsAccepted", e.target.checked)}
          error={errors.termsAccepted}
          name="termsAccepted"
          label={
            <>
              我已閱讀並同意{" "}
              <Link
                href="/legal/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent-2 underline hover:text-accent-1"
              >
                服務條款
              </Link>{" "}
              與{" "}
              <Link
                href="/legal/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent-2 underline hover:text-accent-1"
              >
                隱私政策
              </Link>
            </>
          }
        />

        <Checkbox
          checked={form.marketingOptIn}
          onChange={(e) => update("marketingOptIn", e.target.checked)}
          name="marketingOptIn"
          label="我願意接收電子報、產品更新與優惠通知（可隨時取消）"
        />

        {error ? (
          <div
            data-testid="signup-error"
            className="text-coral"
            style={{ fontSize: "var(--font-size-label)", lineHeight: 1.5 }}
          >
            {error}
          </div>
        ) : null}

        <button
          data-testid="signup-submit"
          type="submit"
          disabled={loading || !form.termsAccepted}
          className="pixel-btn disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ fontSize: 12, padding: "10px 16px", letterSpacing: 2 }}
        >
          {loading ? "註冊中..." : "註冊 ▶"}
        </button>

        <Link
          href="/signin"
          className="text-muted hover:text-accent-2 text-center"
          style={{ fontSize: "var(--font-size-label)" }}
        >
          已有帳號？登入
        </Link>
      </form>
      <AppFooter />
    </main>
  );
}
