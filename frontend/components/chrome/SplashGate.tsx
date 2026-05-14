"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

const SESSION_FLAG = "ft.splash.seen";
const HIDE_DELAY_MS = 1100;
const REMOVE_DELAY_MS = 1600;

/**
 * Boot-time splash overlay — pixel FOCUSTOWN wordmark + tagline +
 * loading bar — shown once per tab via `sessionStorage`. Fades after
 * HIDE_DELAY_MS, unmounts at REMOVE_DELAY_MS. Mounted in the root
 * layout so deep-link routes also get it, not just `/`.
 */
export function SplashGate() {
  // Always start visible on the server / first hydration tick — that way
  // there is no SSR/CSR mismatch on the overlay shape. The effect below
  // either hides immediately (sessionStorage flag set) or schedules the
  // boot-ceremony fade-out. Empty deps array keeps the effect mount-only:
  // it cannot get stuck on a stale `[visible]` closure.
  const [visible, setVisible] = useState(true);
  const [hiding, setHiding] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Subsequent visits in this tab: skip the ceremony entirely.
    if (window.sessionStorage.getItem(SESSION_FLAG)) {
      setVisible(false);
      return;
    }

    // First visit: 1.1s of splash, then 0.5s fade, then unmount.
    const hideTimer = window.setTimeout(() => setHiding(true), HIDE_DELAY_MS);
    const removeTimer = window.setTimeout(() => {
      setVisible(false);
      try {
        window.sessionStorage.setItem(SESSION_FLAG, "1");
      } catch {
        /* private/incognito: best-effort, splash will replay next nav */
      }
    }, REMOVE_DELAY_MS);

    return () => {
      window.clearTimeout(hideTimer);
      window.clearTimeout(removeTimer);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      aria-hidden
      data-testid="splash"
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        background: "var(--bg)",
        zIndex: 99999,
        opacity: hiding ? 0 : 1,
        transition: "opacity 0.45s ease",
        pointerEvents: hiding ? "none" : "auto",
      }}
    >
      <Image
        src="/logo.png"
        alt="Focus Town"
        width={160}
        height={160}
        priority
        style={{
          width: 160,
          height: "auto",
          filter:
            "drop-shadow(0 0 12px var(--a1)) drop-shadow(0 0 28px var(--a3))",
        }}
      />
      <div className="font-pixel-en" style={{ color: "var(--muted)", letterSpacing: "0.2em", fontSize: 12 }}>
        LOADING THE TOWN…
      </div>
      <div
        style={{
          marginTop: 18,
          width: 200,
          height: 8,
          border: "1px solid var(--border2)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            background: "var(--a1)",
            boxShadow: "0 0 8px var(--a1), 0 0 16px var(--a3)",
            animation: "splashLoad 0.9s steps(20) forwards",
          }}
        />
      </div>
      <style>
        {"@keyframes splashLoad { from { width: 0 } to { width: 100% } }"}
      </style>
    </div>
  );
}
