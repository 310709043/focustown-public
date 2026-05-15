/**
 * Integration: a wallet-update WS payload flows into the wallet store and a
 * subsequent shop page render reflects the new balance.
 *
 * This is the most valuable cross-feature seam we can verify in the frontend:
 * the realtime channel that fires after a completed focus session must be
 * picked up by the wallet store and rendered consistently across pages. The
 * unit tier already covers each side (walletStore.applyDelta and the WS
 * client dispatch); this integration test pins the seam between them.
 */
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";

import { useAuthStore } from "@/lib/state/authStore";
import { useUserItemsStore } from "@/lib/state/userItemsStore";
import { useWalletStore } from "@/lib/state/walletStore";
import ShopPage from "@/app/shop/page";
import { tokenStore } from "@/lib/api/client";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

beforeEach(() => {
  tokenStore.save({ access_token: "a", refresh_token: "r" });
  useAuthStore.setState({ user: null, loading: false, error: null });
  useWalletStore.setState({ byCurrency: {} });
  useUserItemsStore.setState({ byShopItemId: {} });
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("wallet balance from store renders as formatted T amount in the shop header", async () => {
  render(<ShopPage />);

  // Initial render: balance is 0 → "0.00 T"
  expect(await screen.findByTitle("T 幣餘額")).toHaveTextContent("0.00 T");

  // Simulate a wallet.updated WS event being applied to the store.
  act(() => {
    useWalletStore.getState().setBalance("T", 250);
  });

  expect(screen.getByTitle("T 幣餘額")).toHaveTextContent("2.50 T");
});
