/**
 * onboardingStore — first-time tour state machine.
 *
 * Worth testing (the parts a refactor could silently break):
 * - start() activates the tour at step 0
 * - next() advances by 1 when not at the last step
 * - next() at the last step finishes (active=false, completed=true)
 *   and resets currentStep — the "step 5 → done" boundary is the most
 *   error-prone spot in this store.
 * - back() at step 0 is a no-op (no negative index)
 * - back() decrements when past step 0
 * - skip() and complete() both finalize the tour
 * - restart() flips completed=false AND active=true so the existing
 *   completed flag in localStorage doesn't block the re-run.
 *
 * NOT worth testing:
 * - The zustand `persist` middleware itself (third-party).
 * - The exact localStorage key string — `tests/setup.ts` clears it after
 *   every test, so persistence side effects don't leak.
 */
import { afterEach, beforeEach, expect, test } from "vitest";

import {
  ONBOARDING_TOTAL_STEPS,
  useOnboardingStore,
} from "@/lib/state/onboardingStore";

beforeEach(() => {
  useOnboardingStore.setState({
    completed: false,
    active: false,
    currentStep: 0,
  });
});

afterEach(() => {
  useOnboardingStore.setState({
    completed: false,
    active: false,
    currentStep: 0,
  });
});

test("start activates the tour at step 0", () => {
  useOnboardingStore.getState().start();

  const state = useOnboardingStore.getState();
  expect(state.active).toBe(true);
  expect(state.currentStep).toBe(0);
});

test("next advances by 1 when not at the last step", () => {
  useOnboardingStore.setState({ active: true, currentStep: 1 });
  useOnboardingStore.getState().next();

  expect(useOnboardingStore.getState().currentStep).toBe(2);
});

test("next at the last step completes the tour", () => {
  useOnboardingStore.setState({
    active: true,
    completed: false,
    currentStep: (ONBOARDING_TOTAL_STEPS - 1) as 4,
  });
  useOnboardingStore.getState().next();

  const state = useOnboardingStore.getState();
  expect(state.active).toBe(false);
  expect(state.completed).toBe(true);
  expect(state.currentStep).toBe(0);
});

test("back at step 0 is a no-op (cannot go negative)", () => {
  useOnboardingStore.setState({ active: true, currentStep: 0 });
  useOnboardingStore.getState().back();

  expect(useOnboardingStore.getState().currentStep).toBe(0);
});

test("back decrements when past step 0", () => {
  useOnboardingStore.setState({ active: true, currentStep: 3 });
  useOnboardingStore.getState().back();

  expect(useOnboardingStore.getState().currentStep).toBe(2);
});

test("skip marks completed and deactivates", () => {
  useOnboardingStore.setState({
    active: true,
    completed: false,
    currentStep: 2,
  });
  useOnboardingStore.getState().skip();

  const state = useOnboardingStore.getState();
  expect(state.active).toBe(false);
  expect(state.completed).toBe(true);
  expect(state.currentStep).toBe(0);
});

test("complete marks completed and deactivates", () => {
  useOnboardingStore.setState({
    active: true,
    completed: false,
    currentStep: 3,
  });
  useOnboardingStore.getState().complete();

  const state = useOnboardingStore.getState();
  expect(state.active).toBe(false);
  expect(state.completed).toBe(true);
});

test("restart flips completed back to false AND activates", () => {
  // Simulate a user who finished the tour previously, then asked to
  // replay it from ProfileModal.
  useOnboardingStore.setState({
    active: false,
    completed: true,
    currentStep: 0,
  });
  useOnboardingStore.getState().restart();

  const state = useOnboardingStore.getState();
  expect(state.active).toBe(true);
  expect(state.completed).toBe(false);
  expect(state.currentStep).toBe(0);
});
