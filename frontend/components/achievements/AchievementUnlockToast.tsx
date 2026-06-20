"use client";

import { useEffect, useRef, useState } from "react";

interface AchievementUnlockToastProps {
  name: string;
  icon: string;
  visible: boolean;
  onDismiss: () => void;
}

export function AchievementUnlockToast({
  name,
  icon,
  visible,
  onDismiss,
}: AchievementUnlockToastProps) {
  const [phase, setPhase] = useState<"entering" | "visible" | "exiting">("entering");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!visible) return;
    setPhase("entering");
    const showTimer = setTimeout(() => setPhase("visible"), 50);
    const exitTimer = setTimeout(() => setPhase("exiting"), 3600);
    const dismissTimer = setTimeout(() => onDismiss(), 4000);
    timerRef.current = dismissTimer;
    return () => {
      clearTimeout(showTimer);
      clearTimeout(exitTimer);
      clearTimeout(dismissTimer);
    };
  }, [visible, onDismiss]);

  if (!visible) return null;

  const isExiting = phase === "exiting";

  return (
    <div
      role="status"
      aria-live="polite"
      onClick={onDismiss}
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 200,
        cursor: "pointer",
        animation: isExiting
          ? "slideOutRight 400ms ease-in forwards"
          : "slideInRight 400ms cubic-bezier(0.22,1,0.36,1) forwards",
        maxWidth: 280,
      }}
    >
      <div
        className="pixel-panel font-silkscreen"
        style={{
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          background: "rgba(12,5,35,0.97)",
          border: "1px solid var(--accent)",
          boxShadow:
            "0 0 12px rgba(167,139,250,0.35), 0 0 2px var(--accent), inset 0 0 20px rgba(0,0,0,0.5)",
        }}
      >
        <span style={{ fontSize: 22, lineHeight: 1, flexShrink: 0 }}>{icon}</span>
        <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
          <span
            style={{
              fontSize: 9,
              letterSpacing: "0.28em",
              color: "var(--accent)",
              textShadow: "var(--neon-glow)",
              whiteSpace: "nowrap",
            }}
          >
            ✦ ACHIEVEMENT UNLOCKED
          </span>
          <span
            style={{
              fontSize: 11,
              letterSpacing: "0.14em",
              color: "var(--ink)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {name}
          </span>
        </div>
      </div>
    </div>
  );
}
