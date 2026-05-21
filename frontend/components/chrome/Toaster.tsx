"use client";

import { useTranslations } from "next-intl";

import { useToastStore, type Toast } from "@/lib/state/toastStore";

const KIND_BORDER: Record<Toast["kind"], string> = {
  error: "var(--coral)",
  info: "var(--accent-3)",
  success: "var(--teal)",
};

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  const tA11y = useTranslations("common.a11y");

  if (toasts.length === 0) return null;

  return (
    <div
      data-testid="toaster"
      className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 pointer-events-none"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          aria-live={t.kind === "error" ? "assertive" : "polite"}
          className="pixel-panel pointer-events-auto flex items-center gap-3"
          style={{
            borderColor: KIND_BORDER[t.kind],
            maxWidth: "20rem",
            padding: "8px 12px",
            fontSize: 11,
            color: "var(--ink)",
            lineHeight: 1.5,
          }}
        >
          <span style={{ flex: 1, wordBreak: "break-word" }}>{t.message}</span>
          <button
            type="button"
            onClick={() => dismiss(t.id)}
            aria-label={tA11y("dismissAria")}
            className="font-silkscreen"
            style={{
              fontSize: 10,
              color: "var(--ink-mute)",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: "2px 4px",
            }}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
