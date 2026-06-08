"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { CamState, FaceDirection } from "./useFaceDirection";

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
  /** Dismiss the supervise overlay (cat retreats). */
  dismiss: () => void;
}

// --- Thresholds (seconds) ---
const SUSPICIOUS_AFTER = 3;
const ANGRY_AFTER = 8;
const SLEEPING_AFTER = 30;
const HAPPY_BUBBLE_INTERVAL = 30;

/** Directions considered "focused" (looking at the screen). */
const FOCUSED_DIRECTIONS: ReadonlySet<FaceDirection> = new Set([
  "front",
  "up",
  "down",
]);

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

/**
 * Synthesise a short cat-like chirp via Web Audio API.
 * Runs entirely in-browser with no audio file dependency.
 */
function playMeow(): void {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    // Rising-then-falling pitch mimics a short meow.
    osc.frequency.setValueAtTime(600, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(900, ctx.currentTime + 0.08);
    osc.frequency.linearRampToValueAtTime(500, ctx.currentTime + 0.2);

    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.25);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.25);

    // Clean up after playback.
    osc.onended = () => void ctx.close();
  } catch {
    // AudioContext not available — fail silently.
  }
}

/**
 * Derives the cat's mood and supervise state from face direction + cam state.
 *
 * Mood ladder (while looking away):
 *   watching → suspicious (3s, panel-only) → angry (8s, pop-out) → sleeping (30s)
 *
 * Looking back at any point resets to happy + auto-dismisses overlay.
 */
export function useCatMood(
  direction: FaceDirection,
  camState: CamState,
): UseCatMoodResult {
  const [mood, setMood] = useState<CatMood>("idle");
  const [isSupervising, setIsSupervising] = useState(false);
  const [speechKey, setSpeechKey] = useState<string | null>(null);
  const [focusStreak, setFocusStreak] = useState(0);
  const [nudgeCount, setNudgeCount] = useState(0);

  const awaySecondsRef = useRef(0);
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

  useEffect(() => {
    if (camState !== "active") {
      setMood("idle");
      setIsSupervising(false);
      setSpeechKey(null);
      awaySecondsRef.current = 0;
      focusSecondsRef.current = 0;
      setFocusStreak(0);
      return;
    }

    const id = setInterval(() => {
      const isFocused = FOCUSED_DIRECTIONS.has(direction);

      if (isFocused) {
        awaySecondsRef.current = 0;
        focusSecondsRef.current += 1;
        setFocusStreak(focusSecondsRef.current);

        const prev = prevMoodRef.current;

        // Just came back from being away — show relief + auto-dismiss overlay.
        if (prev === "angry" || prev === "suspicious" || prev === "sleeping") {
          setIsSupervising(false);
          showSpeech("bubbleWelcomeBack", 3000);
        }

        setMood("happy");
        prevMoodRef.current = "happy";

        // Periodic encouraging bubbles.
        if (
          focusSecondsRef.current - lastHappyBubbleRef.current >=
          HAPPY_BUBBLE_INTERVAL
        ) {
          lastHappyBubbleRef.current = focusSecondsRef.current;
          showSpeech(pickRandom(HAPPY_SPEECH_KEYS), 2500);
        }
      } else {
        focusSecondsRef.current = 0;
        lastHappyBubbleRef.current = 0;
        setFocusStreak(0);
        awaySecondsRef.current += 1;
        const away = awaySecondsRef.current;

        if (away >= SLEEPING_AFTER) {
          setMood("sleeping");
          setIsSupervising(false);
          if (prevMoodRef.current !== "sleeping") {
            showSpeech("bubbleSleep", 4000);
          }
          prevMoodRef.current = "sleeping";
        } else if (away >= ANGRY_AFTER) {
          // Pop-out: cat runs to centre of screen.
          if (prevMoodRef.current !== "angry") {
            setNudgeCount((n) => n + 1);
            showSpeech(pickRandom(ANGRY_SPEECH_KEYS), 4000);
            playMeow();
          }
          setMood("angry");
          setIsSupervising(true);
          prevMoodRef.current = "angry";
        } else if (away >= SUSPICIOUS_AFTER) {
          // Panel-only warning: tilt + speech bubble.
          if (prevMoodRef.current !== "suspicious") {
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
  }, [camState, direction, showSpeech]);

  // Cleanup speech timeout on unmount.
  useEffect(
    () => () => {
      if (speechTimeoutRef.current) clearTimeout(speechTimeoutRef.current);
    },
    [],
  );

  return { mood, isSupervising, speechKey, focusStreak, nudgeCount, dismiss };
}
