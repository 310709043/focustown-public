"use client";

import { useTranslations } from "next-intl";

import { PixelSprite } from "@/components/pixel/PixelSprite";
import { characterKeyToAvatar } from "@/lib/data/character-to-avatar";

interface FriendRow {
  readonly characterKey: string;
  readonly name: string;
  readonly taskKey: string;
  readonly tomatoes: number;
}

const SEED: ReadonlyArray<FriendRow> = [
  { characterKey: "yuki", name: "Yuki", taskKey: "writing", tomatoes: 3 },
  { characterKey: "kai", name: "Kai", taskKey: "coding", tomatoes: 5 },
  { characterKey: "aria", name: "Aria", taskKey: "reading", tomatoes: 2 },
  { characterKey: "milo", name: "Milo", taskKey: "design", tomatoes: 4 },
];

/**
 * "Friends focusing now" right-column panel. Seed data only — wiring to a
 * real friends-presence API is a follow-up PR. The +1 button is a future
 * cheer/poke ping; renders the affordance but no-ops on click.
 */
export function FriendsNow() {
  const t = useTranslations("focus.solo.friendsNow");
  return (
    <div
      data-testid="friends-now"
      className="pixel-panel"
      style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span
          className="font-silkscreen"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontSize: 10,
            color: "var(--accent-2)",
            letterSpacing: "0.2em",
          }}
        >
          <span
            aria-hidden
            className="animate-blinkSoft"
            style={{
              width: 6,
              height: 6,
              background: "var(--accent-2)",
              boxShadow: "var(--neon-glow-pink)",
            }}
          />
          {t("header")}
        </span>
        <span
          className="font-silkscreen"
          style={{ fontSize: 9, color: "var(--ink-dim)", letterSpacing: "0.15em" }}
        >
          {t("onlineCount", { count: SEED.length })}
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {SEED.map((f) => {
          const avatar = characterKeyToAvatar(f.characterKey);
          return (
            <div
              key={f.characterKey}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "3px 6px",
                background: "rgba(0,0,0,0.3)",
                border: "1px solid var(--panel-stroke)",
              }}
            >
              <div style={{ position: "relative", flexShrink: 0 }}>
                <PixelSprite sprite={avatar.sprite} palette={avatar.palette} scale={1.4} />
                <span
                  aria-hidden
                  style={{
                    position: "absolute",
                    bottom: 0,
                    right: 0,
                    width: 6,
                    height: 6,
                    background: "#6ee7b7",
                    border: "1px solid var(--bg-0)",
                  }}
                />
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 0,
                  flex: 1,
                  minWidth: 0,
                }}
              >
                <span
                  className="font-silkscreen"
                  style={{ fontSize: 10, color: "var(--ink)", letterSpacing: "0.08em" }}
                >
                  {f.name}
                </span>
                <span
                  className="font-silkscreen"
                  style={{
                    fontSize: 8,
                    color: "var(--accent-3)",
                    letterSpacing: "0.1em",
                  }}
                >
                  #{t(`tasks.${f.taskKey}` as "tasks.writing")} · 🍅 {f.tomatoes}
                </span>
              </div>
              <button
                type="button"
                className="pixel-btn primary"
                style={{ fontSize: 9, padding: "3px 6px" }}
                onClick={() => {
                  /* future: cheer ping endpoint */
                }}
              >
                {t("joinCta")}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
