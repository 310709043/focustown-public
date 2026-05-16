"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { PixelCheckbox } from "./PixelCheckbox";

interface AgendaItem {
  id: number;
  textKey: string;
  done: boolean;
  current?: boolean;
}

const SEED: ReadonlyArray<AgendaItem> = [
  { id: 1, textKey: "items.0", done: true },
  { id: 2, textKey: "items.1", done: true },
  { id: 3, textKey: "items.2", done: false, current: true },
  { id: 4, textKey: "items.3", done: false },
  { id: 5, textKey: "items.4", done: false },
];

/**
 * Shared agenda checklist. The "current" item is highlighted with a pink
 * `rgba(236,72,153,0.1)` background + accent-2 border + neon-glow-pink
 * shadow + a `NOW` chip on the right. Reference: screen-buddy.jsx:L152-L190.
 *
 * Local state for the visual port — sharing the actual checklist between
 * the two users is a follow-up (would need a new "agenda" backend table).
 */
export function SharedAgenda() {
  const t = useTranslations("focus.buddy.agenda");
  const [items, setItems] = useState<AgendaItem[]>([...SEED]);
  const doneCount = items.filter((it) => it.done).length;

  const toggle = (id: number) =>
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, done: !it.done } : it)),
    );

  return (
    <div
      data-testid="shared-agenda"
      className="pixel-panel"
      style={{ padding: 12, display: "flex", flexDirection: "column", gap: 6 }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span
          className="font-silkscreen"
          style={{
            fontSize: 10,
            color: "var(--accent)",
            letterSpacing: "0.2em",
          }}
        >
          ● {t("header")}
        </span>
        <span
          className="font-silkscreen"
          style={{ fontSize: 9, color: "var(--ink-dim)" }}
        >
          {doneCount} / {items.length}
        </span>
      </div>
      {items.map((it) => (
        <div
          key={it.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "4px 6px",
            background: it.current ? "rgba(236,72,153,0.1)" : "rgba(0,0,0,0.3)",
            border: `1px solid ${it.current ? "var(--accent-2)" : "var(--panel-stroke)"}`,
            cursor: "pointer",
            boxShadow: it.current ? "var(--neon-glow-pink)" : "none",
          }}
          onClick={() => toggle(it.id)}
        >
          <PixelCheckbox checked={it.done} onToggle={() => toggle(it.id)} />
          <span
            className="font-silkscreen"
            style={{
              flex: 1,
              fontSize: 11,
              color: it.done ? "var(--ink-dim)" : "var(--ink)",
              textDecoration: it.done ? "line-through" : "none",
            }}
          >
            {t(it.textKey as "items.0")}
          </span>
          {it.current ? (
            <span
              className="font-silkscreen"
              style={{
                fontSize: 8,
                color: "var(--accent-2)",
                letterSpacing: "0.2em",
                textShadow: "var(--neon-glow-pink)",
              }}
            >
              {t("nowLabel")}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}
