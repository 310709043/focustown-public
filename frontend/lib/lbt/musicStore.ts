import { create } from "zustand";

import {
  clampLevel,
  createMusicEngine,
  firstTrackAt,
  type MusicEngine,
  type MusicLevel,
} from "./music";

/**
 * Music on/off, volume step and the current track. The engine is created on
 * the first play (inside the click), so the page never loads audio for
 * visitors who leave it off. The volume step is a per-visitor convenience
 * kept in localStorage; playing never resumes by itself.
 */
const LEVEL_KEY = "lbt.music.level";
const SEEN_KEY = "lbt.music.seen";

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage blocked: fine, it is only a convenience */
  }
}

interface MusicState {
  playing: boolean;
  level: MusicLevel;
  track: number;
  /** Played at least once (this visit or before): the hint is no longer shown. */
  seen: boolean;
  /** Played in this visit: phones show the header control from then on. */
  started: boolean;
  hydrate(): void;
  toggle(): Promise<void>;
  pause(): void;
  setLevel(level: MusicLevel): void;
  amplitude(): number;
}

let engine: MusicEngine | null = null;
let engineFactory: (startTrack: number) => MusicEngine = createMusicEngine;

/** Tests swap the Web Audio engine for a fake. */
export function setMusicEngineFactory(
  factory: (startTrack: number) => MusicEngine,
) {
  engineFactory = factory;
  engine = null;
}

export const useMusicStore = create<MusicState>((set, get) => ({
  playing: false,
  level: 0,
  track: 0,
  seen: false,
  started: false,

  hydrate() {
    set({
      level: clampLevel(read(LEVEL_KEY)),
      seen: read(SEEN_KEY) === "1",
      track: firstTrackAt(new Date()),
    });
  },

  async toggle() {
    if (get().playing) {
      get().pause();
      return;
    }
    if (!engine) {
      engine = engineFactory(get().track);
      engine.onTrack((track) => set({ track }));
    }
    set({ playing: true, seen: true, started: true });
    write(SEEN_KEY, "1");
    await engine.play(get().level);
  },

  pause() {
    if (!get().playing) return;
    engine?.pause();
    set({ playing: false });
  },

  setLevel(level) {
    set({ level });
    write(LEVEL_KEY, String(level));
    engine?.setLevel(level);
  },

  amplitude() {
    return get().playing && engine ? engine.amplitude() : 0;
  },
}));
