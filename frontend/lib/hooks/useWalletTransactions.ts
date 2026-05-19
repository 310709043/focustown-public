"use client";

import { useEffect, useState } from "react";

import { walletApi } from "@/lib/api/endpoints";
import type { WalletTransaction } from "@/lib/api/types.gen";

interface State {
  rows: WalletTransaction[];
  loading: boolean;
  error: string | null;
}

const INITIAL: State = { rows: [], loading: true, error: null };

export function useWalletTransactions(limit = 20): State {
  const [state, setState] = useState<State>(INITIAL);

  useEffect(() => {
    let cancelled = false;
    setState({ rows: [], loading: true, error: null });
    walletApi
      .transactions(limit)
      .then((rows) => {
        if (cancelled) return;
        setState({ rows, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "wallet_tx_failed";
        setState({ rows: [], loading: false, error: message });
      });
    return () => {
      cancelled = true;
    };
  }, [limit]);

  return state;
}
