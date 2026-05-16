"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

interface Task {
  id: string;
  label: string;
  done: boolean;
}

const SEED: ReadonlyArray<Task> = [
  { id: "t1", label: "完成第三章草稿", done: false },
  { id: "t2", label: "回覆 3 封信", done: true },
  { id: "t3", label: "整理參考資料", done: false },
  { id: "t4", label: "10 分鐘伸展", done: false },
];

/**
 * Solo-room local todo list. Local state only — the reference design
 * uses tasks as a per-session worksheet rather than a persistent list.
 */
export function TasksPanel() {
  const t = useTranslations("focus.solo.tasksPanel");
  const [tasks, setTasks] = useState<Task[]>([...SEED]);
  const [draft, setDraft] = useState("");

  const toggle = (id: string) =>
    setTasks((prev) =>
      prev.map((task) =>
        task.id === id ? { ...task, done: !task.done } : task,
      ),
    );

  const add = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    setTasks((prev) => [
      ...prev,
      { id: `t-${Date.now()}`, label: trimmed, done: false },
    ]);
    setDraft("");
  };

  const done = tasks.filter((task) => task.done).length;

  return (
    <div
      data-testid="tasks-panel"
      className="pixel-panel"
      style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span
          className="font-silkscreen"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontSize: 10,
            color: "var(--accent-3)",
            letterSpacing: "0.2em",
          }}
        >
          <span
            aria-hidden
            className="animate-blinkSoft"
            style={{
              width: 6,
              height: 6,
              background: "var(--accent-3)",
              boxShadow: "var(--neon-glow-cyan)",
            }}
          />
          {t("header")}
        </span>
        <span
          className="font-silkscreen"
          style={{ fontSize: 9, color: "var(--ink-dim)", letterSpacing: "0.15em" }}
        >
          {t("doneOf", { done, total: tasks.length })}
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {tasks.map((task) => (
          <div
            key={task.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "4px 6px",
              background: "rgba(0,0,0,0.3)",
              border: "1px solid var(--panel-stroke)",
            }}
          >
            <span
              role="checkbox"
              aria-checked={task.done}
              tabIndex={0}
              onClick={() => toggle(task.id)}
              onKeyDown={(e) => {
                if (e.key === " " || e.key === "Enter") {
                  e.preventDefault();
                  toggle(task.id);
                }
              }}
              style={{
                width: 14,
                height: 14,
                border: "1px solid var(--accent-3)",
                background: task.done ? "var(--accent-3)" : "transparent",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              {task.done ? (
                <span
                  style={{
                    color: "#0a0524",
                    fontSize: 10,
                    fontWeight: 700,
                    lineHeight: 1,
                  }}
                >
                  ✓
                </span>
              ) : null}
            </span>
            <span
              className="font-silkscreen"
              style={{
                flex: 1,
                fontSize: 11,
                color: task.done ? "var(--ink-dim)" : "var(--ink)",
                textDecoration: task.done ? "line-through" : "none",
              }}
            >
              {task.label}
            </span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        <input
          className="pixel-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={t("addPlaceholder")}
          style={{ flex: 1, fontSize: 11, padding: "6px 10px" }}
        />
        <button
          type="button"
          aria-label={t("addCta")}
          className="pixel-btn primary"
          style={{ padding: "0 12px", fontSize: 11 }}
          onClick={add}
        >
          +
        </button>
      </div>
    </div>
  );
}
