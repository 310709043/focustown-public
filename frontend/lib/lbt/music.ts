/**
 * Background music for the town: two tracks that take turns, blended with a
 * short crossfade, behind one master gain and an analyser the battery reads
 * to move its mouth.
 *
 * Nothing loads or plays until the visitor asks (browsers refuse sound
 * before a gesture, and a low-battery visitor should never be startled).
 * The engine is created on the first play, inside that click.
 */

export const MUSIC_TRACKS = [
  {
    id: "afternoon-curtains",
    title: "Afternoon Curtains",
    src: "/audio/lbt/afternoon-curtains.mp3",
  },
  {
    id: "cold-windowpane",
    title: "Cold Windowpane",
    src: "/audio/lbt/cold-windowpane.mp3",
  },
] as const;

/** Gain per volume step: quiet, medium, loud. Quiet is the default. */
export const MUSIC_LEVELS = [0.18, 0.35, 0.6] as const;
export type MusicLevel = 0 | 1 | 2;

export const MUSIC_CROSSFADE_S = 2;
export const MUSIC_FADE_IN_S = 0.6;
export const MUSIC_FADE_OUT_S = 0.4;

/** Daytime (06:30–19:00) opens with the afternoon track, night and dawn with the window one. */
export function firstTrackAt(date: Date): number {
  const m = date.getHours() * 60 + date.getMinutes();
  return m >= 6 * 60 + 30 && m < 19 * 60 ? 0 : 1;
}

export function clampLevel(value: unknown): MusicLevel {
  const n = Number(value);
  return n === 1 || n === 2 ? n : 0;
}

export interface MusicEngine {
  play(level: MusicLevel): Promise<void>;
  pause(): void;
  setLevel(level: MusicLevel): void;
  /** Loudness of what is playing right now, 0..1 (smoothed). */
  amplitude(): number;
  onTrack(listener: (index: number) => void): () => void;
}

export function createMusicEngine(startTrack: number): MusicEngine {
  const AudioCtx: typeof AudioContext =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const ctx = new AudioCtx();
  const master = ctx.createGain();
  master.gain.value = 0;
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.55;
  const samples = new Uint8Array(analyser.fftSize);
  master.connect(analyser);
  analyser.connect(ctx.destination);

  const players = MUSIC_TRACKS.map((track) => {
    const el = new Audio(track.src);
    el.preload = "auto";
    const gain = ctx.createGain();
    gain.gain.value = 0;
    ctx.createMediaElementSource(el).connect(gain);
    gain.connect(master);
    return { el, gain };
  });

  let current = startTrack;
  let playing = false;
  let fading = false;
  let level: MusicLevel = 0;
  let smooth = 0;
  let watch: ReturnType<typeof setInterval> | undefined;
  let stopTimer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<(index: number) => void>();

  const ramp = (param: AudioParam, to: number, seconds: number) => {
    const now = ctx.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(to, now + seconds);
  };

  const crossfadeTo = (next: number, seconds: number) => {
    if (fading) return;
    fading = true;
    const from = players[current];
    const to = players[next];
    to.el.currentTime = 0;
    to.gain.gain.value = 0;
    void to.el.play().catch(() => undefined);
    ramp(to.gain.gain, 1, seconds);
    ramp(from.gain.gain, 0, seconds);
    setTimeout(
      () => {
        from.el.pause();
        from.el.currentTime = 0;
        fading = false;
      },
      seconds * 1000 + 60,
    );
    current = next;
    listeners.forEach((listener) => listener(current));
  };

  players.forEach((player, index) => {
    // A track that ends without the watcher catching it (a slow tab) still hands over.
    player.el.addEventListener("ended", () => {
      if (playing && !fading && index === current)
        crossfadeTo((index + 1) % players.length, 0.05);
    });
  });

  return {
    async play(nextLevel) {
      level = nextLevel;
      clearTimeout(stopTimer);
      if (ctx.state === "suspended") await ctx.resume();
      playing = true;
      const player = players[current];
      player.gain.gain.value = 1;
      await player.el.play().catch(() => undefined);
      ramp(master.gain, MUSIC_LEVELS[level], MUSIC_FADE_IN_S);
      clearInterval(watch);
      watch = setInterval(() => {
        const p = players[current];
        if (!playing || fading || !p.el.duration) return;
        if (p.el.duration - p.el.currentTime <= MUSIC_CROSSFADE_S) {
          crossfadeTo((current + 1) % players.length, MUSIC_CROSSFADE_S);
        }
      }, 150);
    },
    pause() {
      playing = false;
      clearInterval(watch);
      ramp(master.gain, 0, MUSIC_FADE_OUT_S);
      stopTimer = setTimeout(
        () => players.forEach((p) => p.el.pause()),
        MUSIC_FADE_OUT_S * 1000 + 20,
      );
    },
    setLevel(nextLevel) {
      level = nextLevel;
      if (playing) ramp(master.gain, MUSIC_LEVELS[level], 0.25);
    },
    amplitude() {
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (let i = 0; i < samples.length; i += 1) {
        const v = (samples[i] - 128) / 128;
        sum += v * v;
      }
      const target = Math.min(
        1,
        Math.sqrt(sum / samples.length) / (0.04 + MUSIC_LEVELS[level] * 0.2),
      );
      smooth += (target - smooth) * (target > smooth ? 0.5 : 0.16);
      return smooth;
    },
    onTrack(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
