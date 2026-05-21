/**
 * toastStore — global notification queue.
 *
 * Worth testing (these rules govern the UX):
 * - push adds the toast and returns its id; the toast disappears after
 *   its kind-specific TTL
 * - dismiss(id) removes only that toast; other toasts stay
 * - clear() empties the queue regardless of TTL state
 * - pushErrorToast / pushInfoToast funnel through push with the right kind
 *
 * NOT worth testing:
 * - the random-id fallback when crypto.randomUUID is missing — vitest's
 *   jsdom provides crypto.randomUUID by default
 */
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import {
  pushErrorToast,
  pushInfoToast,
  useToastStore,
} from "@/lib/state/toastStore";

beforeEach(() => {
  vi.useFakeTimers();
  useToastStore.setState({ toasts: [] });
});

afterEach(() => {
  vi.useRealTimers();
});

test("push appends a toast with a stable id and returns it", () => {
  const id = useToastStore.getState().push({ kind: "info", message: "hello" });
  const toasts = useToastStore.getState().toasts;

  expect(toasts).toHaveLength(1);
  expect(toasts[0].id).toBe(id);
  expect(toasts[0].message).toBe("hello");
  expect(toasts[0].kind).toBe("info");
});

test("info toasts auto-dismiss after 3 seconds (default TTL)", () => {
  useToastStore.getState().push({ kind: "info", message: "hi" });
  vi.advanceTimersByTime(2999);
  expect(useToastStore.getState().toasts).toHaveLength(1);

  vi.advanceTimersByTime(2);
  expect(useToastStore.getState().toasts).toHaveLength(0);
});

test("error toasts hold for 5 seconds (longer default TTL)", () => {
  useToastStore.getState().push({ kind: "error", message: "boom" });
  vi.advanceTimersByTime(3000);
  expect(useToastStore.getState().toasts).toHaveLength(1);

  vi.advanceTimersByTime(2001);
  expect(useToastStore.getState().toasts).toHaveLength(0);
});

test("explicit ttlMs overrides the kind default", () => {
  useToastStore.getState().push({ kind: "error", message: "x", ttlMs: 100 });
  vi.advanceTimersByTime(101);
  expect(useToastStore.getState().toasts).toHaveLength(0);
});

test("dismiss(id) removes only the matching toast", () => {
  const a = useToastStore.getState().push({ kind: "info", message: "a" });
  const b = useToastStore.getState().push({ kind: "info", message: "b" });

  useToastStore.getState().dismiss(a);
  const ids = useToastStore.getState().toasts.map((t) => t.id);

  expect(ids).toEqual([b]);
});

test("dismiss(unknown id) is a no-op", () => {
  useToastStore.getState().push({ kind: "info", message: "a" });

  useToastStore.getState().dismiss("nope");

  expect(useToastStore.getState().toasts).toHaveLength(1);
});

test("clear empties the queue immediately", () => {
  useToastStore.getState().push({ kind: "info", message: "a" });
  useToastStore.getState().push({ kind: "error", message: "b" });

  useToastStore.getState().clear();

  expect(useToastStore.getState().toasts).toEqual([]);
});

test("pushErrorToast funnels through push with kind=error", () => {
  pushErrorToast("oops");
  const toasts = useToastStore.getState().toasts;

  expect(toasts).toHaveLength(1);
  expect(toasts[0].kind).toBe("error");
  expect(toasts[0].message).toBe("oops");
});

test("pushInfoToast funnels through push with kind=info", () => {
  pushInfoToast("fyi");
  const toasts = useToastStore.getState().toasts;

  expect(toasts[0].kind).toBe("info");
  expect(toasts[0].message).toBe("fyi");
});
