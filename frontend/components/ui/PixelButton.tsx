"use client";

import { clsx } from "clsx";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg" | "xl";

interface PixelButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  pulse?: boolean;
  children: ReactNode;
}

const sizeMap: Record<Size, string> = {
  sm: "text-[8px] px-3 py-1.5",
  md: "text-[10px] px-4 py-2",
  lg: "text-[12px] px-6 py-3",
  xl: "text-[16px] px-8 py-5",
};

const variantStyles: Record<Variant, string> = {
  primary: "",
  ghost:
    "!bg-transparent !border-border !text-muted hover:!border-accent-1 hover:!text-accent-1 !shadow-none hover:!shadow-[0_0_18px_rgba(167,139,250,0.35)]",
  danger:
    "!border-coral !text-coral hover:!text-white !shadow-[0_3px_0_0_#7f1d1d,_0_0_14px_rgba(251,113,133,0.3)]",
};

export function PixelButton({
  variant = "primary",
  size = "md",
  pulse = false,
  className,
  children,
  ...props
}: PixelButtonProps) {
  return (
    <button
      {...props}
      className={clsx(
        "pixel-btn",
        sizeMap[size],
        variantStyles[variant],
        pulse && "animate-bigPulse",
        className,
      )}
    >
      {children}
    </button>
  );
}
