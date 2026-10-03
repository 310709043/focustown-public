"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Entry animation built from the logo: the battery "B" is drawn, its
 * terminal pops on, the peach charge fills the lower bowl under a street
 * lamp glow, then "Low" and "atteryTown" slide in around it and the whole
 * night fades into the town.
 *
 * - Plays once per tab (sessionStorage); a click or any key skips it.
 * - Skipped for prefers-reduced-motion and for automated browsers.
 * - Rendered on the server so the first frame is already the intro; the
 *   CSS alone also ends it (lbt-intro-out), so it can never get stuck
 *   even if this script never runs.
 * - Decorative only (aria-hidden): the page underneath is complete.
 */
const SEEN_KEY = "lbt.intro.seen";
/** Matches the lbt-intro-out timing in lbt.css (delay + duration). */
const TOTAL_MS = 2650;
const SKIP_FADE_MS = 280;

type Phase = "playing" | "leaving" | "gone";

function shouldSkip(): boolean {
  try {
    if (window.sessionStorage.getItem(SEEN_KEY)) return true;
  } catch {
    /* storage blocked: play it */
  }
  if (navigator.webdriver) return true;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

export function IntroSplash({ tagline }: { tagline: string }) {
  const [phase, setPhase] = useState<Phase>("playing");
  const skipRef = useRef<() => void>(() => setPhase("gone"));

  useEffect(() => {
    if (shouldSkip()) {
      setPhase("gone");
      return;
    }
    try {
      window.sessionStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* storage blocked: it will play again next time, which is fine */
    }
    let leaveTimer: ReturnType<typeof setTimeout> | undefined;
    const done = setTimeout(() => setPhase("gone"), TOTAL_MS);
    let skipped = false;
    const skip = () => {
      if (skipped) return;
      skipped = true;
      clearTimeout(done);
      setPhase("leaving");
      leaveTimer = setTimeout(() => setPhase("gone"), SKIP_FADE_MS);
    };
    skipRef.current = skip;
    window.addEventListener("keydown", skip, { once: true });
    return () => {
      clearTimeout(done);
      clearTimeout(leaveTimer);
      window.removeEventListener("keydown", skip);
    };
  }, []);

  if (phase === "gone") return null;

  return (
    <div
      className={`lbt-intro${phase === "leaving" ? " is-leaving" : ""}`}
      aria-hidden="true"
      data-testid="lbt-intro"
      onClick={() => skipRef.current()}
    >
      <span className="lbt-intro-stars" />
      <span className="lbt-intro-glow" />
      <div className="lbt-intro-mark">
        <span className="lbt-intro-word lbt-intro-low">Low</span>
        <svg className="lbt-intro-b" viewBox="1 1 80 111" focusable="false">
          <defs>
            <clipPath id="lbt-intro-bowl">
              <path d="M9.75 55.25H48a24.25 24.25 0 0 1 0 48.5H9.75Z" />
            </clipPath>
          </defs>
          <rect className="lbt-intro-terminal" x="21" y="2" width="25" height="13" rx="4" />
          <g clipPath="url(#lbt-intro-bowl)">
            <rect className="lbt-intro-charge" x="0" y="55" width="82" height="50" />
          </g>
          <path
            className="lbt-intro-outline"
            pathLength={1}
            d="M9.75 103.75V19.75H45.5a17.75 17.75 0 0 1 0 35.5H9.75M45.5 55.25H48a24.25 24.25 0 0 1 0 48.5H9.75"
          />
        </svg>
        <span className="lbt-intro-word lbt-intro-rest">atteryTown</span>
      </div>
      <p className="lbt-intro-tagline">{tagline}</p>
    </div>
  );
}
