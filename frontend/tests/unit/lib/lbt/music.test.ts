/**
 * Music: which track opens at which hour, the volume step guard, and the
 * store's contract with the engine (created on the first play only, never
 * resuming by itself, the volume step remembered per visitor).
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { clampLevel, firstTrackAt, type MusicEngine } from "@/lib/lbt/music";
import { setMusicEngineFactory, useMusicStore } from "@/lib/lbt/musicStore";

const at = (h: number, m = 0) => new Date(2026, 9, 5, h, m);

describe("firstTrackAt", () => {
  test.each([
    [6, 29, 1],
    [6, 30, 0],
    [12, 0, 0],
    [18, 59, 0],
    [19, 0, 1],
    [23, 30, 1],
    [3, 0, 1],
  ] as const)("%i:%i opens with track %i", (h, m, want) => {
    expect(firstTrackAt(at(h, m))).toBe(want);
  });
});

describe("clampLevel", () => {
  test("keeps 0 / 1 / 2 and turns anything else into the quiet default", () => {
    expect([0, 1, 2, "2", null, "loud", 7, -1].map(clampLevel)).toEqual([0, 1, 2, 2, 0, 0, 0, 0]);
  });
});

function fakeEngine() {
  const calls: string[] = [];
  let trackListener: ((i: number) => void) | null = null;
  const engine: MusicEngine = {
    play: vi.fn(async (level) => {
      calls.push(`play:${level}`);
    }),
    pause: vi.fn(() => {
      calls.push("pause");
    }),
    setLevel: vi.fn((level) => {
      calls.push(`level:${level}`);
    }),
    amplitude: () => 0.5,
    onTrack: (listener) => {
      trackListener = listener;
      return () => undefined;
    },
  };
  return { engine, calls, nextTrack: (i: number) => trackListener?.(i) };
}

describe("useMusicStore", () => {
  let fake: ReturnType<typeof fakeEngine>;
  let factory: ReturnType<typeof vi.fn<(startTrack: number) => MusicEngine>>;

  beforeEach(() => {
    window.localStorage.clear();
    fake = fakeEngine();
    factory = vi.fn(() => fake.engine);
    setMusicEngineFactory(factory);
    useMusicStore.setState({ playing: false, level: 0, track: 0, seen: false, started: false });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("nothing is created or played before the first toggle", () => {
    useMusicStore.getState().hydrate();
    expect(factory).not.toHaveBeenCalled();
    expect(useMusicStore.getState().playing).toBe(false);
  });

  test("hydrate restores the volume step and the hint state, and picks the hour's track", () => {
    vi.useFakeTimers();
    vi.setSystemTime(at(22));
    window.localStorage.setItem("lbt.music.level", "2");
    window.localStorage.setItem("lbt.music.seen", "1");
    useMusicStore.getState().hydrate();
    expect(useMusicStore.getState()).toMatchObject({ level: 2, seen: true, track: 1, playing: false });
  });

  test("toggle plays at the saved level, then pauses; the engine is created once", async () => {
    useMusicStore.setState({ level: 1, track: 1 });
    await useMusicStore.getState().toggle();
    expect(factory).toHaveBeenCalledWith(1);
    expect(useMusicStore.getState()).toMatchObject({ playing: true, seen: true, started: true });
    expect(window.localStorage.getItem("lbt.music.seen")).toBe("1");

    await useMusicStore.getState().toggle();
    await useMusicStore.getState().toggle();
    expect(factory).toHaveBeenCalledTimes(1);
    expect(fake.calls).toEqual(["play:1", "pause", "play:1"]);
  });

  test("setLevel is remembered and forwarded to a running engine", async () => {
    useMusicStore.getState().setLevel(2);
    expect(window.localStorage.getItem("lbt.music.level")).toBe("2");
    await useMusicStore.getState().toggle();
    useMusicStore.getState().setLevel(0);
    expect(fake.calls).toEqual(["play:2", "level:0"]);
  });

  test("the current track follows the engine's crossfades", async () => {
    await useMusicStore.getState().toggle();
    fake.nextTrack(1);
    expect(useMusicStore.getState().track).toBe(1);
  });

  test("amplitude is silent while paused", async () => {
    expect(useMusicStore.getState().amplitude()).toBe(0);
    await useMusicStore.getState().toggle();
    expect(useMusicStore.getState().amplitude()).toBe(0.5);
    useMusicStore.getState().pause();
    expect(useMusicStore.getState().amplitude()).toBe(0);
  });
});
