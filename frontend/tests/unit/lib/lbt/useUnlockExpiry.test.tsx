import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import { useUnlocks } from "@/lib/lbt/unlocks";
import { useUnlockExpiry } from "@/lib/lbt/useUnlockExpiry";

afterEach(() => {
  vi.useRealTimers();
  useUnlocks.setState({ items: [], loaded: false, expiresAt: null });
});

test("an open scene expires at its deadline without a reload", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-05T10:00:00Z"));
  useUnlocks.setState({ items: ["koi-pond"], loaded: true, expiresAt: Date.now() + 1000 });
  const view = renderHook(() => useUnlockExpiry());
  act(() => vi.advanceTimersByTime(1000));
  expect(useUnlocks.getState().items).toEqual([]);
  view.unmount();
});

test("long terms avoid the browser's maximum timeout limit", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-05T10:00:00Z"));
  const lifetime = 180 * 86_400_000;
  useUnlocks.setState({ items: ["koi-pond"], loaded: true, expiresAt: Date.now() + lifetime });
  const view = renderHook(() => useUnlockExpiry());
  act(() => vi.advanceTimersByTime(86_400_000));
  expect(useUnlocks.getState().items).toEqual(["koi-pond"]);
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
});
