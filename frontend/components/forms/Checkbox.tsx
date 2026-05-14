"use client";

import { forwardRef } from "react";
import clsx from "clsx";

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: React.ReactNode;
  error?: string | null;
};

export const Checkbox = forwardRef<HTMLInputElement, Props>(function Checkbox(
  { label, error, className, id, ...rest },
  ref,
) {
  const inputId = id ?? `cb-${rest.name ?? Math.random().toString(36).slice(2, 8)}`;
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
      <span className="text-[11px] leading-snug text-text">
        {label}
        {error ? (
          <span className="block text-coral text-[10px] mt-0.5">{error}</span>
        ) : null}
      </span>
    </label>
  );
});
