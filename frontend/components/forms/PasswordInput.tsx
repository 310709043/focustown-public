"use client";

import { useState, forwardRef } from "react";
import clsx from "clsx";

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & {
  /** Pixel-art frame style by default; pass false to render naked. */
  framed?: boolean;
};

export const PasswordInput = forwardRef<HTMLInputElement, Props>(
  function PasswordInput({ framed = true, className, ...rest }, ref) {
    const [visible, setVisible] = useState(false);
    return (
      <div className="relative">
        <input
          ref={ref}
          type={visible ? "text" : "password"}
          {...rest}
          className={clsx(
            // Pixel-shell when framed (default); pr-10 reserves space for
            // the show/hide toggle. The `pixel-input` class already sets
            // font, focus glow, and direction-aware stroke.
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
          aria-label={visible ? "隱藏密碼" : "顯示密碼"}
          aria-pressed={visible}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-accent-2 px-1.5 py-0.5 border border-border rounded font-pixel tracking-wide"
          style={{ fontSize: "var(--font-size-caption)" }}
        >
          {visible ? "隱藏" : "顯示"}
        </button>
      </div>
    );
  },
);
