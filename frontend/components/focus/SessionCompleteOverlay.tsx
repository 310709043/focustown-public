"use client";

import { useEffect, useMemo } from "react";

interface SessionCompleteOverlayProps {
  visible: boolean;
  onDismiss: () => void;
}

const PARTICLES = [
  { color: "#fbbf24", left: "20%", delay: "0s", size: 8 },
  { color: "#00f5d4", left: "35%", delay: "0.15s", size: 6 },
  { color: "#fbbf24", left: "50%", delay: "0.05s", size: 10 },
  { color: "#a78bfa", left: "65%", delay: "0.2s", size: 7 },
  { color: "#00f5d4", left: "78%", delay: "0.1s", size: 9 },
  { color: "#fbbf24", left: "12%", delay: "0.25s", size: 6 },
  { color: "#f472b6", left: "88%", delay: "0.08s", size: 8 },
  { color: "#a78bfa", left: "42%", delay: "0.3s", size: 5 },
];

export function SessionCompleteOverlay({
  visible,
  onDismiss,
}: SessionCompleteOverlayProps) {
  useEffect(() => {
    if (!visible) return;
    const id = setTimeout(onDismiss, 4000);
    return () => clearTimeout(id);
  }, [visible, onDismiss]);

  if (!visible) return null;

  return (
    <>
      <style>{`
        @keyframes particleRise {
          0%   { transform: translateY(0) scale(1); opacity: 1; }
          80%  { opacity: 0.8; }
          100% { transform: translateY(-220px) scale(0.4); opacity: 0; }
        }
        @keyframes completePop {
          0%   { transform: scale(0.6); opacity: 0; }
          60%  { transform: scale(1.08); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes glowPulse {
          0%, 100% { text-shadow: 0 0 12px #fbbf24, 0 0 24px #fbbf24; }
          50%       { text-shadow: 0 0 24px #fbbf24, 0 0 48px #f59e0b; }
        }
        @keyframes batteryBounce {
          0%        { transform: translateY(0); }
          30%       { transform: translateY(-8px); }
          50%       { transform: translateY(0); }
          70%       { transform: translateY(-4px); }
          100%      { transform: translateY(0); }
        }
      `}</style>

      {/* Backdrop */}
      <div
        role="dialog"
        aria-modal
        aria-label="Session complete"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 1000,
          background: "rgba(0,0,0,0.82)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backdropFilter: "blur(2px)",
        }}
        onClick={onDismiss}
      >
        {/* Particles */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            overflow: "hidden",
            pointerEvents: "none",
          }}
        >
          {PARTICLES.map((p, i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                bottom: "42%",
                left: p.left,
                width: p.size,
                height: p.size,
                background: p.color,
                boxShadow: `0 0 6px ${p.color}`,
                animation: `particleRise 1.8s ease-out ${p.delay} forwards`,
              }}
            />
          ))}
        </div>

        {/* Card */}
        <div
          className="pixel-panel"
          onClick={(e) => e.stopPropagation()}
          style={{
            padding: "32px 40px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 20,
            animation: "completePop 0.4s cubic-bezier(0.34,1.56,0.64,1) forwards",
            maxWidth: 340,
            width: "calc(100vw - 40px)",
            position: "relative",
            zIndex: 1,
          }}
        >
          <div
            className="font-silkscreen"
            style={{
              fontSize: 11,
              letterSpacing: "0.3em",
              color: "#fbbf24",
              animation: "glowPulse 1.5s ease-in-out infinite",
              textAlign: "center",
            }}
          >
            ✦ SESSION COMPLETE ✦
          </div>

          <div
            className="font-silkscreen"
            style={{
              fontSize: 28,
              letterSpacing: "0.15em",
              color: "var(--ink)",
              animation: "batteryBounce 0.8s ease 0.3s both",
              textAlign: "center",
            }}
          >
            +1 🔋
          </div>

          <div
            className="font-silkscreen"
            style={{
              fontSize: 9,
              color: "var(--ink-mute)",
              letterSpacing: "0.2em",
              textAlign: "center",
            }}
          >
            BATTERY CHARGED
          </div>

          <button
            type="button"
            className="pixel-btn primary"
            style={{ padding: "10px 24px", fontSize: 11, marginTop: 4 }}
            onClick={onDismiss}
          >
            CONTINUE →
          </button>
        </div>
      </div>
    </>
  );
}
