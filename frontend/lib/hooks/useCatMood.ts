"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { CamState, FaceDirection } from "./useFaceDirection";

export type CatMood = "idle" | "happy" | "watching" | "suspicious" | "angry" | "sleeping";

/** Accumulated session analytics — updated every second while active. */
export interface SupervisionStats {
  /** Total seconds the cam has been active this session. */
  sessionSeconds: number;
  /** Total seconds the user was focused (looking at screen). */
  focusedSeconds: number;
  /** Total seconds the user was distracted (looking away). */
  distractedSeconds: number;
  /** Number of distraction episodes (each time mood escalates past watching). */
  distractionCount: number;
  /** Longest unbroken focus streak in seconds. */
  longestStreak: number;
  /** Focus quality 0-100 (focusedSeconds / sessionSeconds * 100). */
  focusScore: number;
  /** Timeline of mood events for the session. */
  timeline: ReadonlyArray<TimelineEvent>;
}

export interface TimelineEvent {
  ts: number; // seconds since session start
  mood: CatMood;
}

export interface UseCatMoodResult {
  mood: CatMood;
  isSupervising: boolean;
  speechKey: string | null;
  focusStreak: number;
  nudgeCount: number;
  stats: SupervisionStats;
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

function playMeow(): void {
  try {
    const ctx = new AudioContext();
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
    osc.onended = () => void ctx.close();
  } catch {
    // AudioContext not available.
  }
}

const EMPTY_STATS: SupervisionStats = {
  sessionSeconds: 0,
  focusedSeconds: 0,
  distractedSeconds: 0,
  distractionCount: 0,
  longestStreak: 0,
  focusScore: 0,
  timeline: [],
};

export function useCatMood(
  direction: FaceDirection,
  camState: CamState,
): UseCatMoodResult {
  const [mood, setMood] = useState<CatMood>("idle");
  const [isSupervising, setIsSupervising] = useState(false);
  const [speechKey, setSpeechKey] = useState<string | null>(null);
  const [focusStreak, setFocusStreak] = useState(0);
  const [nudgeCount, setNudgeCount] = useState(0);
  const [stats, setStats] = useState<SupervisionStats>(EMPTY_STATS);

  const awaySecondsRef = useRef(0);
  const focusSecondsRef = useRef(0);
  const lastHappyBubbleRef = useRef(0);
  const speechTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevMoodRef = useRef<CatMood>("idle");

  // Accumulated stats refs (mutated every tick, flushed to state periodically).
  const sessionSecondsRef = useRef(0);
  const focusedSecondsRef = useRef(0);
  const distractedSecondsRef = useRef(0);
  const distractionCountRef = useRef(0);
  const longestStreakRef = useRef(0);
  const timelineRef = useRef<TimelineEvent[]>([]);
  const inDistractionRef = useRef(false);
  const lastRecordedMoodRef = useRef<CatMood>("idle");
  // Flush counter — update React state every N ticks to avoid re-render spam.
  const flushCounterRef = useRef(0);

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
      // Don't reset stats — keep them visible after disabling so user can review.
      return;
    }

    // Reset stats on fresh activation.
    sessionSecondsRef.current = 0;
    focusedSecondsRef.current = 0;
    distractedSecondsRef.current = 0;
    distractionCountRef.current = 0;
    longestStreakRef.current = 0;
    timelineRef.current = [];
    inDistractionRef.current = false;
    lastRecordedMoodRef.current = "watching";
    flushCounterRef.current = 0;
    setStats(EMPTY_STATS);
    setNudgeCount(0);

    const id = setInterval(() => {
      const isFocused = FOCUSED_DIRECTIONS.has(direction);
      sessionSecondsRef.current += 1;

      // --- Stats accumulation ---
      if (isFocused) {
        focusedSecondsRef.current += 1;
        if (inDistractionRef.current) {
          inDistractionRef.current = false;
        }
      } else {
        distractedSecondsRef.current += 1;
        if (!inDistractionRef.current) {
          inDistractionRef.current = true;
          distractionCountRef.current += 1;
        }
      }

      // Track longest streak.
      if (focusSecondsRef.current + (isFocused ? 1 : 0) > longestStreakRef.current && isFocused) {
        longestStreakRef.current = focusSecondsRef.current + 1;
      }

      // --- Mood logic (unchanged) ---
      if (isFocused) {
        awaySecondsRef.current = 0;
        focusSecondsRef.current += 1;
        setFocusStreak(focusSecondsRef.current);

        const prev = prevMoodRef.current;
        if (prev === "angry" || prev === "suspicious" || prev === "sleeping") {
          setIsSupervising(false);
          showSpeech("bubbleWelcomeBack", 3000);
        }

        setMood("happy");
        prevMoodRef.current = "happy";

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
          if (prevMoodRef.current !== "angry") {
            setNudgeCount((n) => n + 1);
            showSpeech(pickRandom(ANGRY_SPEECH_KEYS), 4000);
            playMeow();
          }
          setMood("angry");
          setIsSupervising(true);
          prevMoodRef.current = "angry";
        } else if (away >= SUSPICIOUS_AFTER) {
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

      // --- Timeline recording (only on mood transitions) ---
      const currentMood = prevMoodRef.current;
      if (currentMood !== lastRecordedMoodRef.current) {
        timelineRef.current = [
          ...timelineRef.current,
          { ts: sessionSecondsRef.current, mood: currentMood },
        ];
        lastRecordedMoodRef.current = currentMood;
      }

      // --- Flush stats to React state every 3 ticks ---
      flushCounterRef.current += 1;
      if (flushCounterRef.current >= 3) {
        flushCounterRef.current = 0;
        const total = sessionSecondsRef.current;
        setStats({
          sessionSeconds: total,
          focusedSeconds: focusedSecondsRef.current,
          distractedSeconds: distractedSecondsRef.current,
          distractionCount: distractionCountRef.current,
          longestStreak: longestStreakRef.current,
          focusScore: total > 0 ? Math.round((focusedSecondsRef.current / total) * 100) : 0,
          timeline: [...timelineRef.current],
        });
      }
    }, 1000);

    return () => clearInterval(id);
  }, [camState, direction, showSpeech]);

  useEffect(
    () => () => {
      if (speechTimeoutRef.current) clearTimeout(speechTimeoutRef.current);
    },
    [],
  );

  return { mood, isSupervising, speechKey, focusStreak, nudgeCount, stats, dismiss };
}
