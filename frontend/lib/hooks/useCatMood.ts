"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { CamState } from "./useFaceDirection";

export type CatMood = "idle" | "happy" | "watching" | "suspicious" | "angry" | "sleeping";

export interface UseCatMoodResult {
  mood: CatMood;
  /** Cat has popped out of the panel to scold the user. */
  isSupervising: boolean;
  /** Current speech bubble key (i18n), or null if silent. */
  speechKey: string | null;
  /** How many consecutive seconds the user has been focused. */
  focusStreak: number;
  /** How many times the cat has popped out this session. */
  nudgeCount: number;
  /** Dismiss the supervise overlay manually. */
  dismiss: () => void;
}

// --- Thresholds (seconds) ---
/** Away from window this long → suspicious in panel. */
const SUSPICIOUS_AFTER = 5;
/** Away from window this long → cat pops out big. */
const ANGRY_AFTER = 12;
/** No face detected this long → sleeping. */
const NO_FACE_SLEEPING_AFTER = 20;
/** Encourage every N seconds of focus. */
const HAPPY_BUBBLE_INTERVAL = 30;

const HAPPY_SPEECH_KEYS = [
  "bubbleGreat",
  "bubbleKeepGoing",
  "bubbleNice",
  "bubbleFocused",
] as const;

const SUSPICIOUS_SPEECH_KEYS = [
  "bubbleHmm",
  "bubbleHey",
  "bubbleWhere",
] as const;

const ANGRY_SPEECH_KEYS = [
  "bubbleComeBack",
  "bubbleFocus",
  "bubbleWatching",
] as const;

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

let meowCtx: AudioContext | null = null;

function playMeow(): void {
  try {
    if (!meowCtx || meowCtx.state === "closed") {
      meowCtx = new AudioContext();
    }
    if (meowCtx.state === "suspended") {
      void meowCtx.resume();
    }
    const ctx = meowCtx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(600, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(900, ctx.currentTime + 0.08);
    osc.frequency.linearRampToValueAtTime(500, ctx.currentTime + 0.2);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.25);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.25);
  } catch {
    // AudioContext not available.
  }
}

/**
 * Cat mood system driven by:
 *   - Window visibility (tab hidden / app switched) → distraction trigger
 *   - faceDetected from MediaPipe → presence detection (sleeping when away from desk)
 *
 * Mood ladder (while window is hidden or user switched away):
 *   watching → suspicious (5s, panel) → angry (12s, pop-out overlay + meow)
 *
 * Sleeping: no face detected for 20s (user left the desk).
 * Return: window regains focus / face reappears → auto-dismiss + welcome back.
 */
export function useCatMood(
  faceDetected: boolean,
  camState: CamState,
): UseCatMoodResult {
  const [mood, setMood] = useState<CatMood>("idle");
  const [isSupervising, setIsSupervising] = useState(false);
  const [speechKey, setSpeechKey] = useState<string | null>(null);
  const [focusStreak, setFocusStreak] = useState(0);
  const [nudgeCount, setNudgeCount] = useState(0);

  // Whether the browser window/tab is currently visible and focused.
  const windowFocusedRef = useRef(true);
  const awaySecondsRef = useRef(0);
  const noFaceSecondsRef = useRef(0);
  const focusSecondsRef = useRef(0);
  const lastHappyBubbleRef = useRef(0);
  const speechTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevMoodRef = useRef<CatMood>("idle");

  const showSpeech = useCallback((key: string, durationMs = 3000) => {
    if (speechTimeoutRef.current) clearTimeout(speechTimeoutRef.current);
    setSpeechKey(key);
    speechTimeoutRef.current = setTimeout(() => setSpeechKey(null), durationMs);
  }, []);

  const dismiss = useCallback(() => {
    setIsSupervising(false);
    awaySecondsRef.current = 0;
    setMood("watching");
    setSpeechKey(null);
  }, []);

  // --- Window visibility / focus listeners ---
  useEffect(() => {
    if (camState !== "active") return;

    const onHide = () => { windowFocusedRef.current = false; };
    const onShow = () => { windowFocusedRef.current = true; };

    const onVisChange = () => {
      if (document.hidden) onHide(); else onShow();
    };

    document.addEventListener("visibilitychange", onVisChange);
    window.addEventListener("blur", onHide);
    window.addEventListener("focus", onShow);

    return () => {
      document.removeEventListener("visibilitychange", onVisChange);
      window.removeEventListener("blur", onHide);
      window.removeEventListener("focus", onShow);
    };
  }, [camState]);

  // --- 1-second tick: mood machine ---
  useEffect(() => {
    if (camState !== "active") {
      setMood("idle");
      setIsSupervising(false);
      setSpeechKey(null);
      awaySecondsRef.current = 0;
      noFaceSecondsRef.current = 0;
      focusSecondsRef.current = 0;
      setFocusStreak(0);
      return;
    }

    const id = setInterval(() => {
      const windowFocused = windowFocusedRef.current;
      const prev = prevMoodRef.current;

      // ── Face presence: sleeping when user leaves desk ──
      if (!faceDetected) {
        noFaceSecondsRef.current += 1;
        if (noFaceSecondsRef.current >= NO_FACE_SLEEPING_AFTER && prev !== "sleeping") {
          setMood("sleeping");
          setIsSupervising(false);
          showSpeech("bubbleSleep", 4000);
          prevMoodRef.current = "sleeping";
          focusSecondsRef.current = 0;
          setFocusStreak(0);
        }
        return;
      }
      noFaceSecondsRef.current = 0;

      // ── Window focused = user is present and working ──
      if (windowFocused) {
        awaySecondsRef.current = 0;
        focusSecondsRef.current += 1;
        setFocusStreak(focusSecondsRef.current);

        // Just came back from distraction / away
        if (prev === "angry" || prev === "suspicious" || prev === "sleeping") {
          setIsSupervising(false);
          showSpeech("bubbleWelcomeBack", 3000);
        }

        setMood("happy");
        prevMoodRef.current = "happy";

        if (focusSecondsRef.current - lastHappyBubbleRef.current >= HAPPY_BUBBLE_INTERVAL) {
          lastHappyBubbleRef.current = focusSecondsRef.current;
          showSpeech(pickRandom(HAPPY_SPEECH_KEYS), 2500);
        }
      } else {
        // ── Window hidden / lost focus ──
        focusSecondsRef.current = 0;
        lastHappyBubbleRef.current = 0;
        setFocusStreak(0);
        awaySecondsRef.current += 1;
        const away = awaySecondsRef.current;

        if (away >= ANGRY_AFTER) {
          if (prev !== "angry") {
            setNudgeCount((n) => n + 1);
            showSpeech(pickRandom(ANGRY_SPEECH_KEYS), 4000);
            playMeow();
          }
          setMood("angry");
          setIsSupervising(true);
          prevMoodRef.current = "angry";
        } else if (away >= SUSPICIOUS_AFTER) {
          if (prev !== "suspicious") {
            showSpeech(pickRandom(SUSPICIOUS_SPEECH_KEYS), 2500);
          }
          setMood("suspicious");
          prevMoodRef.current = "suspicious";
        } else {
          setMood("watching");
          prevMoodRef.current = "watching";
        }
      }
    }, 1000);

    return () => clearInterval(id);
  }, [camState, faceDetected, showSpeech]);

  useEffect(
    () => () => {
      if (speechTimeoutRef.current) clearTimeout(speechTimeoutRef.current);
    },
    [],
  );

  return { mood, isSupervising, speechKey, focusStreak, nudgeCount, dismiss };
}
