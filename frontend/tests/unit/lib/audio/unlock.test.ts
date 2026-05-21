/**
 * audio/unlock — sessionStorage flag the splash signin uses to baton-pass
 * autoplay permission to /town's PersonalRadio.
 */
import { beforeEach, expect, test } from "vitest";

import {
  AUDIO_UNLOCK_KEY,
  clearAudioUnlocked,
  isAudioUnlocked,
  markAudioUnlocked,
} from "@/lib/audio/unlock";

beforeEach(() => {
  window.sessionStorage.clear();
});

test("isAudioUnlocked returns false on fresh tab", () => {
  expect(isAudioUnlocked()).toBe(false);
});

test("markAudioUnlocked sets the flag in sessionStorage", () => {
  markAudioUnlocked();

  expect(window.sessionStorage.getItem(AUDIO_UNLOCK_KEY)).toBe("1");
  expect(isAudioUnlocked()).toBe(true);
});

test("clearAudioUnlocked removes the flag", () => {
  markAudioUnlocked();
  clearAudioUnlocked();

  expect(isAudioUnlocked()).toBe(false);
});
