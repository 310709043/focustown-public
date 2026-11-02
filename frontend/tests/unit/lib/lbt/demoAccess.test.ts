import { afterEach, expect, test, vi } from "vitest";

import { demoEnabled } from "@/lib/lbt/demoAccess";

afterEach(() => vi.unstubAllEnvs());

test("production hides scripted chat unless explicitly building an isolated test fixture", () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("LBT_ENABLE_DEMO", "");
  expect(demoEnabled()).toBe(false);
  vi.stubEnv("LBT_ENABLE_DEMO", "1");
  expect(demoEnabled()).toBe(true);
});

test("local development can still exercise the clearly labelled fixture", () => {
  vi.stubEnv("NODE_ENV", "development");
  expect(demoEnabled()).toBe(true);
});
