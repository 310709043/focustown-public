"use client";

import { useTranslations } from "next-intl";

import { Logo } from "@/components/scene/Logo";
import { MiniClock } from "@/components/chrome/MiniClock";
import { PixelSprite } from "@/components/pixel/PixelSprite";
import { CoinBadge } from "@/components/town/CoinBadge";
import { characterKeyToAvatar } from "@/lib/data/character-to-avatar";
import { useRouter } from "@/i18n/routing";
import { useAuthStore } from "@/lib/state/authStore";

/** Solo focus top bar — back / LBT logo · SOLO ROOM subtitle / avatar
 *  pill / mini clock / T-coin balance. */
export function FocusTopBar() {
  const router = useRouter();
  const t = useTranslations("focus.solo.topBar");
  const user = useAuthStore((s) => s.user);
  const avatar = characterKeyToAvatar(user?.character_key);

  return (
    <header
      data-testid="focus-top-bar"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 18px",
        background: "rgba(7,4,26,0.75)",
        borderBottom: "1px solid var(--panel-stroke)",
        position: "relative",
        zIndex: 5,
        gap: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
        <button
          type="button"
          aria-label={t("backAria")}
          className="pixel-btn"
          style={{ fontSize: 11, padding: "6px 12px" }}
          onClick={() => router.push("/town")}
        >
          ◀ {t("backCta")}
        </button>
        <Logo scale={0.9} />
        <span
          className="font-silkscreen"
          style={{
            fontSize: 10,
            color: "var(--accent-3)",
            letterSpacing: "0.28em",
          }}
        >
          · {t("subtitle")}
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "4px 10px 4px 6px",
            border: "1px solid var(--panel-stroke)",
            borderRadius: 6,
            background: "rgba(20,10,50,0.55)",
          }}
        >
          <PixelSprite sprite={avatar.sprite} palette={avatar.palette} scale={1.8} />
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span
              className="font-silkscreen"
              style={{ fontSize: 12, color: "var(--ink)", letterSpacing: "0.08em" }}
            >
              {user?.display_name ?? t("guestName")}
            </span>
            <span
              className="font-silkscreen"
              style={{ fontSize: 9, color: "var(--accent)", letterSpacing: "0.2em" }}
            >
              {t("focusingLine", { minutes: 22 })}
            </span>
          </div>
        </div>
        <MiniClock />
        <CoinBadge />
      </div>
    </header>
  );
}
