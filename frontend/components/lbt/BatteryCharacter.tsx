"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { ENERGY_VISUAL } from "@/lib/lbt/constants";
import { useMusicStore } from "@/lib/lbt/musicStore";
import type { Energy } from "@/lib/lbt/types";

const NOTE_GAP_MS = 650;
const NOTE_THRESHOLD = 0.6;

/**
 * The expressive battery. `data-energy` drives the face (sleepy / calm /
 * bright) in CSS. Its animations pause while it is scrolled out of view or
 * the tab is hidden.
 *
 * The whole battery is the music switch. While music plays it sings: eyes
 * close into arcs, and a mouth opens with the real loudness (`--amp`,
 * written every frame without re-rendering), with a note now and then.
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
  const t = useTranslations("lbt.music");
  const playing = useMusicStore((s) => s.playing);
  const toggle = useMusicStore((s) => s.toggle);
  useSingingMouth(ref, playing && !paused);

  return (
    <div
      ref={ref}
      className={`battery-display${paused ? " motion-paused" : ""}${playing ? " is-singing" : ""}`}
      data-energy={String(energy)}
    >
      <button
        type="button"
        className="battery-music-button"
        aria-pressed={playing}
        aria-label={playing ? t("pause") : t("play")}
        onClick={() => void toggle()}
      />
      <div className="battery-character" aria-hidden="true">
        <div className="battery-tip" />
        <div className="battery-body">
          <div
            className="battery-fill"
            style={{ height: fill, background: color }}
          >
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
            <span className="sing-mouth" />
            <span className="battery-cheeks sing-cheeks" />
          </div>
        </div>
      </div>
      <span className="battery-sleep-mark" aria-hidden="true">
        z<span>z</span>
      </span>
      <span className="battery-spark spark-left" aria-hidden="true">
        ✦
      </span>
      <span className="battery-spark spark-right" aria-hidden="true">
        ✧
      </span>
    </div>
  );
}

/** Drives `--amp` from the music's loudness and lets a note float up on the beat. */
function useSingingMouth(
  ref: React.RefObject<HTMLDivElement | null>,
  active: boolean,
) {
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (!active) {
      node.style.removeProperty("--amp");
      return;
    }
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      node.style.setProperty("--amp", "0.6");
      return () => node.style.removeProperty("--amp");
    }
    let frame = 0;
    let lastNote = 0;
    let wasHigh = false;
    const tick = (time: number) => {
      const amp = useMusicStore.getState().amplitude();
      node.style.setProperty("--amp", amp.toFixed(3));
      const high = amp > NOTE_THRESHOLD;
      if (high && !wasHigh && time - lastNote > NOTE_GAP_MS) {
        lastNote = time;
        floatNote(node);
      }
      wasHigh = high;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      node.style.removeProperty("--amp");
    };
  }, [ref, active]);
}

function floatNote(parent: HTMLElement) {
  if (parent.querySelectorAll(".battery-note").length > 2) return;
  const note = document.createElement("span");
  note.className = "battery-note";
  note.setAttribute("aria-hidden", "true");
  note.textContent = Math.random() < 0.5 ? "♪" : "♫";
  note.style.setProperty("--x", `${Math.round(Math.random() * 26)}px`);
  note.style.setProperty("--dx", `${Math.round(10 + Math.random() * 30)}px`);
  note.addEventListener("animationend", () => note.remove());
  parent.appendChild(note);
}
