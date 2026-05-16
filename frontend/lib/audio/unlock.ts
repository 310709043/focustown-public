/**
 * Shared audio-unlock flag.
 *
 * Browsers block `HTMLAudioElement.play()` until the page has seen a
 * user gesture (click / keypress). The splash page's signin button is
 * such a gesture, so we record it once per tab and pass the baton to
 * `PersonalRadio`, which then auto-plays on mount instead of forcing
 * a second "🔊 點擊聆聽" click on `/town`.
 */

export const AUDIO_UNLOCK_KEY = "focustown.audio_unlocked";

export function isAudioUnlocked(): boolean {
  if (typeof window === "undefined") return false;
  return window.sessionStorage?.getItem(AUDIO_UNLOCK_KEY) === "1";
}

export function markAudioUnlocked(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage?.setItem(AUDIO_UNLOCK_KEY, "1");
}

export function clearAudioUnlocked(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage?.removeItem(AUDIO_UNLOCK_KEY);
}
