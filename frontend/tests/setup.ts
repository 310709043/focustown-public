import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { setupServer } from "msw/node";

import { handlers } from "./fixtures/handlers";

// Stub next-intl globally — component tests don't render through the
// NextIntlClientProvider, so `useTranslations` would otherwise throw.
// Tests that care about specific translated copy mock this per-file.
vi.mock("next-intl", () => ({
  useTranslations:
    (ns?: string) =>
    (key: string, vars?: Record<string, unknown>) => {
      const base = ns ? `${ns}.${key}` : key;
      if (!vars) return base;
      return `${base}(${JSON.stringify(vars)})`;
    },
  useLocale: () => "zh-TW",
  useFormatter: () => ({
    dateTime: (d: Date) => d.toISOString(),
    number: (n: number) => String(n),
    relativeTime: () => "",
  }),
  NextIntlClientProvider: ({ children }: { children: React.ReactNode }) =>
    children as unknown as JSX.Element,
}));

// jsdom doesn't implement Element.scrollTo. Components that auto-scroll
// (e.g. ChatPanel) call it inside useEffect, so a missing impl throws and
// derails the test. Stub once, globally.
if (typeof Element !== "undefined" && !Element.prototype.scrollTo) {
  Element.prototype.scrollTo = (() => undefined) as typeof Element.prototype.scrollTo;
}

// One MSW server for the whole test run. Per-test overrides go through
// `server.use(...)`; we reset after each test so they don't leak.
export const server = setupServer(...handlers);

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
  // Each test starts with a fresh localStorage so token state never bleeds.
  if (typeof localStorage !== "undefined") localStorage.clear();
});

afterAll(() => {
  server.close();
});
