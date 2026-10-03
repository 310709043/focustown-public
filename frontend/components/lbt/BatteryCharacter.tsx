"use client";

import { useEffect, useRef, useState } from "react";

import { ENERGY_VISUAL } from "@/lib/lbt/constants";
import type { Energy } from "@/lib/lbt/types";

/**
 * The expressive battery. `data-energy` drives the face (sleepy / calm /
 * bright) in CSS. Its animations pause while it is scrolled out of view or
 * the tab is hidden.
 */
export function BatteryCharacter({ energy }: { energy: Energy }) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(true);
  const [tabHidden, setTabHidden] = useState(false);

  useEffect(() => {
    const node = ref.current;
    let observer: IntersectionObserver | undefined;
    if (node && "IntersectionObserver" in window) {
      observer = new IntersectionObserver(([entry]) =>
        setInView(entry.isIntersecting),
      );
      observer.observe(node);
    }
    const onVisibility = () => setTabHidden(document.hidden);
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      observer?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const { fill, color } = ENERGY_VISUAL[energy];
  const paused = !inView || tabHidden;

  return (
    <div
      ref={ref}
      className={`battery-display${paused ? " motion-paused" : ""}`}
      data-energy={String(energy)}
      aria-hidden="true"
    >
      <div className="battery-character">
        <div className="battery-tip" />
        <div className="battery-body">
          <div className="battery-fill" style={{ height: fill, background: color }}>
            <span className="battery-face face-sleepy">
              <span className="battery-eyes">
                <i />
                <i />
              </span>
              <span className="battery-mouth sleepy-mouth" />
              <span className="battery-mouth yawn-mouth" />
            </span>
            <span className="battery-face face-calm">
              <span className="battery-eyes">
                <i />
                <i />
              </span>
              <span className="battery-mouth smile-mouth" />
              <span className="battery-cheeks" />
            </span>
            <span className="battery-face face-bright">
              <span className="battery-eyes">
                <i />
                <i />
              </span>
              <span className="battery-mouth grin-mouth" />
              <span className="battery-cheeks" />
            </span>
          </div>
        </div>
      </div>
      <span className="battery-sleep-mark">
        z<span>z</span>
      </span>
      <span className="battery-spark spark-left">✦</span>
      <span className="battery-spark spark-right">✧</span>
    </div>
  );
}
