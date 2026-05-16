"use client";

import { useEffect, type ReactNode } from "react";
import { useTranslations } from "next-intl";

import { CornerDeco } from "@/components/login/CornerDeco";

/**
 * Shared modal chrome — backdrop + pixel-panel + CornerDeco + title bar + ✕.
 *
 * Ported from `reference/screen-town.jsx` modal overlay pattern. Owns ONLY
 * presentation: backdrop blur, pixel-panel border, corner brackets, title
 * stripe, close button, ESC + backdrop-click dismiss, and a scrollable body
 * (max-h:80vh). All business logic lives in the caller's children.
 */
export type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  /** CSS var for title glow + corner deco. Defaults to var(--a2) (pink). */
  accent?: string;
  /** CSS width string. Defaults to min(640px, 92vw). */
  width?: string;
  /** Test id for the panel (backdrop testid is `${testId}-backdrop`). */
  testId?: string;
  children: ReactNode;
};

export function Modal({
  open,
  onClose,
  title,
  accent = "var(--a2)",
  width = "min(640px, 92vw)",
  testId,
  children,
}: ModalProps) {
  const tCommon = useTranslations("common.buttons");

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      data-testid={testId ? `${testId}-backdrop` : undefined}
      onClick={onClose}
      className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{
        background: "rgba(1,0,10,0.85)",
        backdropFilter: "blur(10px)",
      }}
    >
      <div
        data-testid={testId}
        onClick={(e) => e.stopPropagation()}
        className="pixel-panel relative"
        style={{
          width,
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          background: "var(--card)",
          boxShadow: `0 0 40px ${accent}66, 0 0 90px ${accent}22`,
        }}
      >
        <CornerDeco color={accent} />

        {/* Title strip */}
        <div
          className="flex items-center justify-between"
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid var(--panel-stroke)",
          }}
        >
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="animate-blinkSoft"
              style={{
                width: 8,
                height: 8,
                background: accent,
                boxShadow: `0 0 8px ${accent}`,
                display: "inline-block",
              }}
            />
            <h2
              className="font-pixel"
              style={{
                fontSize: 11,
                color: accent,
                letterSpacing: 3,
                textShadow: `0 0 10px ${accent}`,
                margin: 0,
              }}
            >
              {title}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label={tCommon("closeAria")}
            className="font-silkscreen text-muted hover:text-text active:text-text flex items-center justify-center"
            style={{
              width: 32,
              height: 32,
              fontSize: 14,
              background: "transparent",
              border: "1px solid var(--panel-stroke)",
            }}
          >
            ✕
          </button>
        </div>

        {/* Scrollable body */}
        <div
          className="flex-1"
          style={{
            overflowY: "auto",
            padding: 16,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
