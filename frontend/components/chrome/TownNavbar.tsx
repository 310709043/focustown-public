"use client";

import { useTranslations } from "next-intl";

import { Logo } from "@/components/scene/Logo";
import { CoinBadge } from "@/components/town/CoinBadge";
import { Link, useRouter } from "@/i18n/routing";
import { roomApi } from "@/lib/api/endpoints";
import { useAuthStore } from "@/lib/state/authStore";
import { useUserItemsStore } from "@/lib/state/userItemsStore";

import { TopStatusPill } from "./TopStatusPill";

/**
 * Town navbar — sits at the top of `/town`. Extracted from inline
 * markup so the nav row's button styling, store wiring, and routing
 * lives in a single component. Logout/room/shop/awards routes are
 * preserved; only the visual shell moves.
 */
export function TownNavbar() {
  const router = useRouter();
  const signOut = useAuthStore((s) => s.signOut);
  const ownedItemsCount = useUserItemsStore((s) => Object.keys(s.byShopItemId).length);
  const tNav = useTranslations("town.nav");
  const tBadge = useTranslations("town.shopBadge");

  return (
    <nav
      data-testid="town-navbar"
      className="bg-[rgba(2,0,12,0.97)] border-b border-border flex items-center justify-between px-5 z-10"
      style={{ height: 56 }}
    >
      <div className="flex items-center gap-3">
        <Logo scale={1.4} />
      </div>

      <div className="flex gap-2 items-center">
        <CoinBadge />
        <TopStatusPill />

        <Link
          data-testid="nav-awards"
          href="/awards"
          className="border border-border text-muted font-japan rounded-md px-3 py-2 hover:border-amber hover:text-amber transition-colors"
          style={{ fontSize: 13 }}
        >
          {tNav("awards")}
        </Link>

        <button
          data-testid="nav-room"
          className="font-japan rounded-md px-3 py-2 transition-colors flex items-center gap-1.5"
          style={{
            fontSize: 13,
            background:
              "linear-gradient(180deg, rgba(252,211,77,0.16), rgba(252,211,77,0.06))",
            border: "1px solid var(--amber)",
            color: "var(--amber)",
            textShadow: "0 0 8px rgba(252,211,77,0.35)",
            boxShadow:
              "0 0 12px rgba(252,211,77,0.18), inset 0 0 8px rgba(252,211,77,0.08)",
          }}
          onClick={async () => {
            try {
              const room = await roomApi.getMine();
              router.push(`/town/room/${room.id}` as Parameters<typeof router.push>[0]);
            } catch {
              /* hydration retry on next click */
            }
          }}
          title={tNav("myRoomTooltip")}
        >
          {tNav("myRoom")}
        </button>

        <Link
          data-testid="nav-shop"
          href="/shop"
          className="border border-border text-muted font-japan rounded-md px-3 py-2 hover:border-pink hover:text-pink transition-colors flex items-center gap-1.5"
          style={{ fontSize: 13 }}
        >
          {tNav("shop")}
          <span
            style={{
              fontSize: 10,
              color: "var(--amber)",
              background: "rgba(252,211,77,0.12)",
              border: "1px solid rgba(252,211,77,0.4)",
              padding: "1px 5px",
              borderRadius: 99,
              fontFamily: "VT323, monospace",
              letterSpacing: 0.5,
            }}
          >
            {tBadge("unlocked", { count: ownedItemsCount })}
          </span>
        </Link>

        <button
          data-testid="nav-logout"
          className="border border-border text-muted font-japan rounded-md px-3 py-2 hover:border-coral hover:text-coral transition-colors"
          style={{ fontSize: 13 }}
          onClick={() => {
            signOut();
            router.push("/");
          }}
        >
          {tNav("signout")}
        </button>
      </div>
    </nav>
  );
}
