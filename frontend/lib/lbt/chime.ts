/**
 * Soft attention chimes, synthesised (no audio files): a two-note rise when
 * someone arrives, a single small bell for a message. They only sound when
 * the visitor is not looking at the page (see components/lbt/useAttentionCues).
 *
 * Browsers refuse sound before a gesture, so the AudioContext is created by
 * `unlock()` from the visitor's own click or key press; `play()` before that
 * does nothing.
 */

export type Cue = "arrive" | "message";

/** Overall loudness: well under the music's medium step. */
export const CHIME_GAIN = 0.22;
/** Never chime more often than this, however many messages arrive. */
export const CHIME_MIN_GAP_MS = 1500;

export interface ChimePlayer {
  unlock(): void;
  play(cue: Cue): void;
}

export function createChimePlayer(): ChimePlayer {
  let ctx: AudioContext | null = null;
  let out: GainNode | null = null;

  const ensure = () => {
    if (!ctx) {
      const AudioCtx: typeof AudioContext =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      ctx = new AudioCtx();
      out = ctx.createGain();
      out.gain.value = CHIME_GAIN;
      out.connect(ctx.destination);
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  };

  // A small bell: the fundamental plus a quieter inharmonic partial, quick
  // attack, long soft decay.
  const bell = (at: number, freq: number, seconds: number, peak: number) => {
    if (!ctx || !out) return;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(peak, at + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
    env.connect(out);
    [
      [freq, 1],
      [freq * 2.76, 0.18],
    ].forEach(([f, level]) => {
      const osc = ctx!.createOscillator();
      const g = ctx!.createGain();
      osc.type = "sine";
      osc.frequency.value = f;
      g.gain.value = level;
      osc.connect(g);
      g.connect(env);
      osc.start(at);
      osc.stop(at + seconds + 0.05);
    });
  };

  return {
    unlock() {
      try {
        ensure();
      } catch {
        /* no Web Audio: the tab title still tells them */
      }
    },
    play(cue) {
      if (!ctx) return;
      ensure();
      const t = ctx.currentTime + 0.02;
      if (cue === "arrive") {
        bell(t, 659.25, 0.9, 0.9); // E5
        bell(t + 0.16, 987.77, 1.3, 0.8); // B5
      } else {
        bell(t, 880, 0.7, 0.7); // A5
      }
    },
  };
}

let factory: () => ChimePlayer = createChimePlayer;

/** Tests swap the Web Audio player for a fake. */
export function setChimePlayerFactory(next: () => ChimePlayer) {
  factory = next;
}

export function makeChimePlayer(): ChimePlayer {
  return factory();
}
