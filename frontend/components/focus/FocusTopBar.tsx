"use client";

import { useTranslations } from "next-intl";

import { AutoEnvIndicator } from "@/components/focus/AutoEnvIndicator";
import { Logo } from "@/components/scene/Logo";
import { MiniClock } from "@/components/chrome/MiniClock";
import { PixelSprite } from "@/components/pixel/PixelSprite";
import { CoinBadge } from "@/components/town/CoinBadge";
import { characterKeyToAvatar } from "@/lib/data/character-to-avatar";
import { useRouter } from "@/i18n/routing";
import { useAuthStore } from "@/lib/state/authStore";
import { useTimerStore } from "@/lib/state/timerStore";
import { sessionsApi } from "@/lib/api/endpoints";
import { pushErrorToast } from "@/lib/state/toastStore";

/** Solo focus top bar — back / LBT logo · SOLO ROOM subtitle / avatar
 *  pill / mini clock / T-coin balance. */
export function FocusTopBar() {
  const router = useRouter();
  const t = useTranslations("focus.solo.topBar");
  const user = useAuthStore((s) => s.user);
  const avatar = characterKeyToAvatar(user?.character_key);
  const running = useTimerStore((s) => s.running);
  const remaining = useTimerStore((s) => s.remaining);
  const durationSeconds = useTimerStore((s) => s.durationSeconds);
  const minutes = Math.ceil((remaining || durationSeconds) / 60);

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
          onClick={async () => {
            const { session, running: isRunning } = useTimerStore.getState();
            if (isRunning && session) {
              const elapsed = session.duration_seconds - useTimerStore.getState().remaining;
              const elapsedMin = Math.floor(elapsed / 60);
              if (!window.confirm(
                `計時器還在跑（已專注 ${elapsedMin} 分鐘）。確定要離開並放棄本次 session 嗎？`
              )) return;
            }
            if (session) {
              await sessionsApi.cancel(session.id).catch(() => {
                pushErrorToast("Failed to cancel session");
              });
              useTimerStore.getState().reset();
            }
            router.push("/town");
          }}
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
        <AutoEnvIndicator />
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
              {t("focusingLine", { minutes })}
            </span>
          </div>
        </div>
        <MiniClock />
        <CoinBadge />
      </div>
    </header>
  );
}
