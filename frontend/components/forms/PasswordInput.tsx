"use client";

import { useState, forwardRef } from "react";
import { useTranslations } from "next-intl";
import clsx from "clsx";

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & {
  /** Pixel-art frame style by default; pass false to render naked. */
  framed?: boolean;
};

/**
 * Password field with an inline visibility toggle.
 *
 * Round 2: the toggle was a text button ("Show" / "Hide" or "顯示" /
 * "隱藏"). At the narrow widths of the paired signup layout
 * (~166 px) the text intruded on the input and covered placeholder /
 * value characters. Swapped for an inline SVG eye / eye-slash icon
 * (~16 px) so the button stays compact and locale-independent. Same
 * forwarded-ref + props contract — Liskov-clean for existing callers.
 */
export const PasswordInput = forwardRef<HTMLInputElement, Props>(
  function PasswordInput({ framed = true, className, ...rest }, ref) {
    const [visible, setVisible] = useState(false);
    const t = useTranslations("common.forms");
    return (
      <div className="relative">
        <input
          ref={ref}
          type={visible ? "text" : "password"}
          {...rest}
          className={clsx(
            // `pr-10` reserves ~40 px on the right for the icon button.
            // The icon itself is 16 px + 6 px padding × 2 = 28 px wide;
            // 40 px right-padding keeps a comfortable gutter between
            // the input value and the toggle so neither overlaps.
            framed && "pixel-input pr-10",
            className,
          )}
          // Body-scale font on inputs keeps iOS Safari from auto-zooming on
          // focus; the override on top of .pixel-input only touches font-size.
          style={{ fontSize: "var(--font-size-body)", lineHeight: 1.4, ...(rest.style ?? {}) }}
          autoComplete={rest.autoComplete ?? "current-password"}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? t("passwordHideAria") : t("passwordShowAria")}
          aria-pressed={visible}
          className="absolute right-1 top-1/2 -translate-y-1/2 text-muted hover:text-accent-2 active:text-accent-2 flex items-center justify-center"
          style={{
            width: 28,
            height: 28,
            background: "transparent",
            border: "1px solid var(--border)",
            borderRadius: 2,
            cursor: "pointer",
          }}
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
    );
  },
);

/** 16×16 inline eye glyph — pixel-styled stroke, no external icon lib. */
function EyeIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden
    >
      <path d="M1.5 8c1.5-3 4-5 6.5-5s5 2 6.5 5c-1.5 3-4 5-6.5 5S3 11 1.5 8z" />
      <circle cx="8" cy="8" r="2" />
    </svg>
  );
}

/** 16×16 inline eye-with-slash glyph — same stroke + a diagonal cut. */
function EyeOffIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden
    >
      <path d="M1.5 8c1.5-3 4-5 6.5-5s5 2 6.5 5c-1.5 3-4 5-6.5 5S3 11 1.5 8z" />
      <circle cx="8" cy="8" r="2" />
      <line x1="2" y1="2" x2="14" y2="14" />
    </svg>
  );
}
