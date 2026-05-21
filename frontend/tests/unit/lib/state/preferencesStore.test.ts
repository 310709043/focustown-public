/**
 * preferencesStore — user-preferences cache + optimistic PATCH.
 *
 * Worth testing:
 * - ensureHydrated calls /me/preferences exactly once across multiple invocations
 * - ensureHydrated swallows errors so the UI doesn't crash; ``hydrated`` stays false so a later call can retry
 * - patch applies optimistically (slider feels instant) then reconciles to server response
 * - patch DOES NOT roll back on server failure (single-slider correction is too aggressive — next successful call reconciles)
 * - reset returns to the default bundle and clears hydrated flag
 */
import { beforeEach, expect, test, vi } from "vitest";

const getPrefs = vi.fn();
const patchPrefs = vi.fn();

vi.mock("@/lib/api/endpoints", () => ({
  preferencesApi: {
    get: (...a: unknown[]) => getPrefs(...a),
    patch: (...a: unknown[]) => patchPrefs(...a),
  },
}));

import {
  PREF_FOCUS_DURATION_MINUTES,
  PREF_SOUND_MIX,
  usePreferencesStore,
} from "@/lib/state/preferencesStore";

beforeEach(() => {
  usePreferencesStore.getState().reset();
  getPrefs.mockReset();
  patchPrefs.mockReset();
});

test("ensureHydrated fetches once then short-circuits subsequent calls", async () => {
  getPrefs.mockResolvedValue({ [PREF_FOCUS_DURATION_MINUTES]: 50 });

  await usePreferencesStore.getState().ensureHydrated();
  await usePreferencesStore.getState().ensureHydrated();

  expect(getPrefs).toHaveBeenCalledOnce();
  expect(usePreferencesStore.getState().byKey[PREF_FOCUS_DURATION_MINUTES]).toBe(50);
  expect(usePreferencesStore.getState().hydrated).toBe(true);
});

test("ensureHydrated leaves defaults + hydrated=false on fetch failure (retry-friendly)", async () => {
  getPrefs.mockRejectedValue(new Error("network"));

  await usePreferencesStore.getState().ensureHydrated();

  expect(usePreferencesStore.getState().hydrated).toBe(false);
  // Defaults intact.
  expect(usePreferencesStore.getState().byKey[PREF_FOCUS_DURATION_MINUTES]).toBe(25);
});

test("patch applies the change optimistically before the server responds", async () => {
  let resolveServer!: (v: unknown) => void;
  patchPrefs.mockReturnValue(
    new Promise((resolve) => {
      resolveServer = resolve;
    }),
  );

  const pending = usePreferencesStore.getState().patch({
    [PREF_FOCUS_DURATION_MINUTES]: 90,
  });

  // BEFORE the server resolves, the local value already shows 90 — the
  // optimistic apply is what makes the slider feel instant.
  expect(usePreferencesStore.getState().byKey[PREF_FOCUS_DURATION_MINUTES]).toBe(90);

  resolveServer({ [PREF_FOCUS_DURATION_MINUTES]: 90 });
  await pending;
});

test("patch reconciles to server response (server is authoritative)", async () => {
  patchPrefs.mockResolvedValue({ [PREF_FOCUS_DURATION_MINUTES]: 60 });

  // User typed 999 (off-scale); server clamps to 60.
  await usePreferencesStore.getState().patch({ [PREF_FOCUS_DURATION_MINUTES]: 999 });

  expect(usePreferencesStore.getState().byKey[PREF_FOCUS_DURATION_MINUTES]).toBe(60);
});

test("patch leaves the optimistic value in place on server failure (no rollback)", async () => {
  patchPrefs.mockRejectedValue(new Error("503"));

  await usePreferencesStore.getState().patch({
    [PREF_SOUND_MIX]: { lofi: 100, rain: 0, cafe: 0, fire: 0 },
  });

  expect(usePreferencesStore.getState().byKey[PREF_SOUND_MIX]).toEqual({
    lofi: 100,
    rain: 0,
    cafe: 0,
    fire: 0,
  });
});

test("reset restores the default bundle", () => {
  usePreferencesStore.setState({
    byKey: { [PREF_FOCUS_DURATION_MINUTES]: 90 },
    hydrated: true,
  });

  usePreferencesStore.getState().reset();

  expect(usePreferencesStore.getState().hydrated).toBe(false);
  expect(usePreferencesStore.getState().byKey[PREF_FOCUS_DURATION_MINUTES]).toBe(25);
});
