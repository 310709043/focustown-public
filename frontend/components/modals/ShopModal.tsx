"use client";

import { useTranslations } from "next-intl";

import { Modal } from "./Modal";
import { ShopView } from "@/components/views/ShopView";
import { formatMinor, useWalletStore } from "@/lib/state/walletStore";

export function ShopModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("town.modals.shop");
  const tBalance = useWalletStore((s) => s.balanceMinor("T"));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("title")}
      accent="var(--pink)"
      width="min(720px, 94vw)"
      testId="shop-modal"
    >
      {/* In-modal coin badge (route page shows the same badge in its header). */}
      <div className="flex justify-end mb-3">
        <span
          style={{
            background: "rgba(252,211,77,0.07)",
            border: "1px solid rgba(252,211,77,0.45)",
            color: "var(--amber)",
            fontFamily: "var(--font-vt323), monospace",
            letterSpacing: 0.6,
            textShadow: "0 0 6px rgba(252,211,77,0.5)",
            fontSize: 13,
            padding: "4px 10px",
            borderRadius: 6,
          }}
        >
          💰 {formatMinor("T", tBalance)} T
        </span>
      </div>
      <ShopView />
    </Modal>
  );
}
