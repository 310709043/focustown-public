"use client";

import { create } from "zustand";
import type { Wallet } from "../api/types.gen";

/**
 * Phase 2 client-side wallet cache.
 *
 * Server is the source of truth. Two write paths feed this store:
 *   - `hydrate(snapshot)` — full refresh from HTTP (mount + every Nm)
 *   - `applyDelta(currency, balance)` — WS push (`wallet.updated`)
 *
 * All amounts are stored in their currency's minor units (T → cT, TWD →
 * NT$ cents). Use the exported `format` helper to render with the right
 * decimal precision per currency.
 */

interface WalletStore {
  byCurrency: Record<string, number>; // currency_code -> balance_minor
  hydrate: (wallets: Wallet[]) => void;
  setBalance: (currency: string, balanceMinor: number) => void;
  reset: () => void;
  balanceMinor: (currency: string) => number;
}

export const useWalletStore = create<WalletStore>((set, get) => ({
  byCurrency: {},

  hydrate(wallets) {
    const next: Record<string, number> = {};
    for (const w of wallets) next[w.currency_code] = w.balance_minor;
    set({ byCurrency: next });
  },

  setBalance(currency, balanceMinor) {
    set((prev) => ({
      byCurrency: { ...prev.byCurrency, [currency]: balanceMinor },
    }));
  },

  reset() {
    set({ byCurrency: {} });
  },

  balanceMinor(currency) {
    return get().byCurrency[currency] ?? 0;
  },
}));

/** Per-currency display decimals (mirror of backend `CURRENCIES`). */
const DECIMALS: Record<string, number> = {
  T: 2,
  TWD: 0,
};

/** Render an integer minor amount in a currency-appropriate string. */
export function formatMinor(currency: string, amountMinor: number): string {
  const decimals = DECIMALS[currency] ?? 2;
  const divisor = 10 ** decimals;
  const whole = amountMinor / divisor;
  return whole.toFixed(decimals);
}
