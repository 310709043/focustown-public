"use client";

import { forwardRef, useId } from "react";
import clsx from "clsx";

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: React.ReactNode;
  error?: string | null;
};

export const Checkbox = forwardRef<HTMLInputElement, Props>(function Checkbox(
  { label, error, className, id, ...rest },
  ref,
) {
  // React's useId hands out SSR+CSR-stable identifiers, so the label's
  // htmlFor and the input's id match on both sides. Falling back to
  // Math.random() (as the previous implementation did) breaks hydration.
  const reactId = useId();
  const inputId = id ?? `cb-${rest.name ?? reactId}`;
  return (
    <label
      htmlFor={inputId}
      className={clsx("flex items-start gap-2 cursor-pointer select-none", className)}
    >
      <input
        ref={ref}
        id={inputId}
        type="checkbox"
        {...rest}
        className="mt-0.5 w-4 h-4 accent-accent-1 cursor-pointer"
      />
      <span
        className="text-text"
        style={{
          fontSize: "var(--font-size-label)",
          lineHeight: "var(--line-height-body)",
        }}
      >
        {label}
        {error ? (
          <span
            className="block text-coral mt-1"
            style={{ fontSize: "var(--font-size-note)" }}
          >
            {error}
          </span>
        ) : null}
      </span>
    </label>
  );
});
