"use client";

import { useTranslations } from "next-intl";

import { PixelSprite } from "@/components/pixel/PixelSprite";
import { useAuthStore } from "@/lib/state/authStore";
import { characterKeyToAvatar } from "@/lib/data/character-to-avatar";
import { TOMATO } from "@/lib/pixel/sprites/props";

interface UserStatusPillProps {
  /** Filled tomato count; the rest of `total` render dimmed. */
  filled?: number;
  total?: number;
  /** Click handler — reference routes to a profile modal; we leave it
   *  as an optional callback so callers can decide. */
  onClick?: () => void;
}

/**
 * The center pill of the town top HUD: avatar tile (with the user's
 * pixel sprite + online green dot) + name + LV badge + "專注中" status
 * line + tomato chip strip. Visual port of `reference/screen-town.jsx`'s
 * `UserStatusPill`.
 */
export function UserStatusPill({
  filled = 4,
  total = 8,
  onClick,
}: UserStatusPillProps) {
  const user = useAuthStore((s) => s.user);
  const t = useTranslations("town.statusPill");
  const avatar = characterKeyToAvatar(user?.character_key);
  const tomatoes = Array.from({ length: total });
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid="user-status-pill"
      className="font-silkscreen"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "5px 14px 5px 5px",
        background: "rgba(7,4,26,0.92)",
        border: "1px solid var(--accent)",
        boxShadow:
          "var(--neon-glow), inset 0 0 12px rgba(183,148,246,0.1)",
        cursor: onClick ? "pointer" : "default",
        position: "relative",
        transition: "all 0.12s steps(2)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          background: "rgba(0,0,0,0.5)",
          border: "1px solid var(--accent-2)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          flexShrink: 0,
        }}
      >
        <PixelSprite sprite={avatar.sprite} palette={avatar.palette} scale={2} />
        <span
          aria-hidden
          style={{
            position: "absolute",
            bottom: -2,
            right: -2,
            width: 8,
            height: 8,
            background: "#6ee7b7",
            border: "2px solid var(--bg-0)",
          }}
        />
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          gap: 2,
          minWidth: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              fontSize: 13,
              color: "var(--ink)",
              letterSpacing: "0.08em",
            }}
          >
            {user?.display_name ?? "..."}
          </span>
          <span
            style={{
              fontSize: 9,
              color: "var(--accent)",
              letterSpacing: "0.15em",
              padding: "0 4px",
              border: "1px solid var(--accent)",
            }}
          >
            {t("level", { level: 4 })}
          </span>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 9,
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
          <span style={{ color: "var(--accent-2)", letterSpacing: "0.15em" }}>
            {t("focusing", { count: filled + 1 })}
          </span>
          <span style={{ color: "var(--ink-dim)" }}>·</span>
          <span style={{ color: "var(--accent-3)", letterSpacing: "0.1em" }}>
            {t("minutes", { count: 22 })}
          </span>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: 1,
          marginLeft: 6,
          alignItems: "center",
        }}
      >
        {tomatoes.map((_, i) => (
          <PixelSprite
            key={i}
            sprite={TOMATO.sprite}
            palette={TOMATO.palette}
            scale={1.1}
            glow={i < filled ? null : null}
            style={i >= filled ? { opacity: 0.3 } : undefined}
          />
        ))}
        <span style={{ fontSize: 9, color: "var(--ink-dim)", marginLeft: 4 }}>
          {filled}/{total}
        </span>
      </div>
    </button>
  );
}
