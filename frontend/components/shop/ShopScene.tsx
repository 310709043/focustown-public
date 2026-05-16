"use client";

import { ShopView } from "@/components/views/ShopView";

import { ShopTopBar } from "./ShopTopBar";

/**
 * Full-bleed /shop scene: pixel-UI top bar + scrollable chromeless
 * <ShopView> body. ShopModal reuses ShopView directly, so chrome lives
 * here (the route) and not inside the view.
 */
export function ShopScene() {
  return (
    <main
      data-testid="shop-scene"
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: "linear-gradient(135deg, #04011a, #090230, #04011a)",
      }}
    >
      <ShopTopBar />
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: 18,
        }}
      >
        <ShopView />
      </div>
    </main>
  );
}
