"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale } from "next-intl";

import { REGIONS, type Locale } from "@/lib/data/profileOptions";

interface RegionSelectProps {
  value: string;
  onChange: (code: string) => void;
}

/**
 * Custom dropdown rendered as a `pixel-input` styled trigger plus an
 * absolutely-positioned listbox. Click-outside closes; max-height
 * 240 px with scroll to match reference. Locale comes from `next-intl`
 * so the labels match the current page language.
 */
export function RegionSelect({ value, onChange }: RegionSelectProps) {
  const locale = useLocale() as Locale;
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const current = REGIONS.find((r) => r.code === value) ?? REGIONS[0];

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        type="button"
        data-testid="region-trigger"
        onClick={() => setOpen((v) => !v)}
        className="pixel-input"
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          cursor: "pointer",
          textAlign: "left",
          background: "rgba(0,0,0,0.4)",
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 16 }}>{current.flag}</span>
          <span>{current.labels[locale] ?? current.labels.en}</span>
        </span>
        <span style={{ color: "var(--accent-3)" }}>▾</span>
      </button>
      {open ? (
        <div
          role="listbox"
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            zIndex: 50,
            maxHeight: 240,
            overflowY: "auto",
            background: "rgba(7,4,26,0.97)",
            border: "1px solid var(--accent)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.7)",
          }}
        >
          {REGIONS.map((r) => {
            const isSel = r.code === value;
            return (
              <div
                key={r.code}
                role="option"
                aria-selected={isSel}
                onClick={() => {
                  onChange(r.code);
                  setOpen(false);
                }}
                className="font-silkscreen"
                style={{
                  padding: "8px 10px",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  cursor: "pointer",
                  fontSize: 11,
                  color: isSel ? "var(--accent)" : "var(--ink)",
                  background: isSel ? "rgba(183,148,246,0.15)" : "transparent",
                  borderBottom: "1px solid var(--panel-stroke)",
                }}
                onMouseEnter={(e) => {
                  if (!isSel) e.currentTarget.style.background = "rgba(167,139,250,0.08)";
                }}
                onMouseLeave={(e) => {
                  if (!isSel) e.currentTarget.style.background = "transparent";
                }}
              >
                <span style={{ fontSize: 16 }}>{r.flag}</span>
                <span>{r.labels[locale] ?? r.labels.en}</span>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
