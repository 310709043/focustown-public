/**
 * Integration: shop page renders an item, the user buys it, and the UI
 * transitions from "購買" → "✓ 已擁有".
 *
 * This walks the full ShopPage code path: shopApi.list → wallet hydrate →
 * userItems hydrate → click Buy → purchaseApi.buy → walletStore update →
 * userItemsStore update → UI reflects ownership. The unit tier covers each
 * store and the api client; this is the seam test that the page wires them
 * together correctly.
 */
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ShopPage from "@/app/shop/page";
import { tokenStore } from "@/lib/api/client";
import { useAuthStore } from "@/lib/state/authStore";
import { useUserItemsStore } from "@/lib/state/userItemsStore";
import { useWalletStore } from "@/lib/state/walletStore";
import { server } from "../setup";

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

const BASE = "http://localhost:8000";

const car = {
  id: "shop-car-1",
  category: "car",
  icon: "🚗",
  name: "霓虹跑車",
  description: "test",
  price_cents: 4900,
  featured: false,
  prices: [{ currency_code: "T", amount_minor: 80 }],
};

beforeEach(() => {
  tokenStore.save({ access_token: "a", refresh_token: "r" });
  useAuthStore.setState({ user: null, loading: false, error: null });
  useWalletStore.setState({ byCurrency: { T: 200 } });
  useUserItemsStore.setState({ byShopItemId: {} });

  server.use(
    http.get(`${BASE}/api/v1/shop`, () => HttpResponse.json([car])),
    http.get(`${BASE}/api/v1/me/wallet`, () =>
      HttpResponse.json([{ currency_code: "T", balance_minor: 200 }]),
    ),
    http.get(`${BASE}/api/v1/me/items`, () => HttpResponse.json([])),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("buying an item flips the card to owned and decrements the visible balance", async () => {
  server.use(
    http.post(
      `${BASE}/api/v1/shop/items/:id/purchase`,
      () =>
        HttpResponse.json({
          item_id: car.id,
          transaction_id: "txn-1",
          currency_code: "T",
          new_balance_minor: 120,
          delta_minor: -80,
          acquired_at: "2026-05-15T12:00:00Z",
        }),
    ),
  );

  const user = userEvent.setup();
  render(<ShopPage />);

  // Wait for the card to render, then locate the Buy button inside it.
  const card = (await screen.findByText("霓虹跑車")).closest("div")!;
  const buyButton = within(card.parentElement!).getByRole("button", { name: "購買" });

  await user.click(buyButton);

  // After the purchase response, the card should advertise ownership and
  // the header balance should reflect the new amount.
  expect(
    await within(card.parentElement!).findByText("✓ 已擁有"),
  ).toBeInTheDocument();
  expect(screen.getByTitle("T 幣餘額")).toHaveTextContent("1.20 T");
});
