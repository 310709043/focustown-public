/**
 * timerStore — Pomodoro tick math.
 *
 * Worth testing:
 * - setMode resets remaining + duration + running
 * - tick() decrements remaining while running
 * - tick() is a no-op when paused
 * - tick() at remaining=1 flips to 0 and stops, then calls complete()
 * - tomatoCount increments (capped at 4) on focus completion
 *
 * NOT worth testing:
 * - The interval-id wiring; tests drive tick() directly so we don't depend
 *   on a real setInterval.
 */
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { useTimerStore } from "@/lib/state/timerStore";
import { makeFocusSession } from "@/tests/fixtures/factories";

vi.mock("@/lib/api/endpoints", () => ({
  sessionsApi: {
    start: vi.fn(),
    complete: vi.fn().mockResolvedValue(undefined),
  },
}));

beforeEach(() => {
  useTimerStore.setState({
    mode: "focus",
    durationSeconds: 1500,
    remaining: 1500,
    running: false,
    session: null,
    tomatoCount: 0,
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

test("setMode resets remaining + duration + stops running", () => {
  useTimerStore.setState({ remaining: 50, running: true });
  useTimerStore.getState().setMode("short", 300);
  expect(useTimerStore.getState()).toMatchObject({
    mode: "short",
    durationSeconds: 300,
    remaining: 300,
    running: false,
  });
});

test("tick decrements remaining while running", () => {
  useTimerStore.setState({ remaining: 10, running: true });
  useTimerStore.getState().tick();
  expect(useTimerStore.getState().remaining).toBe(9);
});

test("tick is a no-op when paused", () => {
  useTimerStore.setState({ remaining: 10, running: false });
  useTimerStore.getState().tick();
  expect(useTimerStore.getState().remaining).toBe(10);
});

test("tick at remaining=1 zeroes out and stops", async () => {
  useTimerStore.setState({
    remaining: 1,
    running: true,
    session: makeFocusSession({ id: "s-active" }),
  });
  useTimerStore.getState().tick();
  expect(useTimerStore.getState().remaining).toBe(0);
  expect(useTimerStore.getState().running).toBe(false);
});

test("focus completion bumps tomatoCount (capped at 4)", async () => {
  useTimerStore.setState({
    mode: "focus",
    tomatoCount: 3,
    session: makeFocusSession(),
  });
  await useTimerStore.getState().complete();
  expect(useTimerStore.getState().tomatoCount).toBe(4);

  // Already at cap — does not exceed 4.
  useTimerStore.setState({ session: makeFocusSession() });
  await useTimerStore.getState().complete();
  expect(useTimerStore.getState().tomatoCount).toBe(4);
});

test("non-focus completion does NOT bump tomatoCount", async () => {
  useTimerStore.setState({
    mode: "short",
    tomatoCount: 2,
    session: makeFocusSession({ mode: "short" }),
  });
  await useTimerStore.getState().complete();
  expect(useTimerStore.getState().tomatoCount).toBe(2);
});
