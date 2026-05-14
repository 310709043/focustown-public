"use client";

import { useEffect, useState } from "react";

import { PixelWord } from "@/components/pixel/PixelWord";

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
  // Lazy initializer reads sessionStorage synchronously on the client so
  // subsequent reloads skip the splash entirely (no one-frame flash). The
  // server always renders `visible=true` because it has no sessionStorage;
  // React reconciles on hydration. The visible overlay being an absolute
  // fixed-position aria-hidden div means the hydration delta is invisible
  // to assistive tech and the document outline.
  const [visible, setVisible] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return !window.sessionStorage.getItem(SESSION_FLAG);
  });
  const [hiding, setHiding] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !visible) return;

    // Deliberate first-load boot ceremony: the splash blocks pointer events
    // for HIDE_DELAY_MS — that's a feature, not a bug. Don't shorten this
    // without a UX reason.
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
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      aria-hidden
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
      <PixelWord text="FOCUSTOWN" color="var(--a2)" glow="var(--a3)" scale={6} />
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
