/**
 * walletStore — local cache for per-currency balances.
 *
 * Worth testing:
 * - hydrate replaces the entire cache (so removed currencies disappear)
 * - setBalance preserves other currencies (immutable update)
 * - balanceMinor returns 0 for unknown currency rather than undefined
 * - formatMinor uses 2-decimal default and 0-decimal for TWD
 *
 * NOT worth testing:
 * - reset() — trivial
 */
import { beforeEach, describe, expect, test } from "vitest";
import { formatMinor, useWalletStore } from "@/lib/state/walletStore";

beforeEach(() => {
  useWalletStore.setState({ byCurrency: {} });
});

test("hydrate replaces all balances", () => {
  useWalletStore.setState({ byCurrency: { OLD: 100 } });
  useWalletStore.getState().hydrate([
    { currency_code: "T", balance_minor: 250 },
  ]);
  expect(useWalletStore.getState().byCurrency).toEqual({ T: 250 });
});

test("setBalance preserves other currencies", () => {
  useWalletStore.setState({ byCurrency: { T: 100, TWD: 5000 } });
  useWalletStore.getState().setBalance("T", 200);
  expect(useWalletStore.getState().byCurrency).toEqual({ T: 200, TWD: 5000 });
});

test("balanceMinor returns 0 for unknown currency", () => {
  expect(useWalletStore.getState().balanceMinor("MISSING")).toBe(0);
});

test("formatMinor renders T with two decimals", () => {
  expect(formatMinor("T", 250)).toBe("2.50");
});

test("formatMinor renders TWD with zero decimals", () => {
  expect(formatMinor("TWD", 5000)).toBe("5000");
});
