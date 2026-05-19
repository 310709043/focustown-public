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

// Today's goal is hardcoded for this round — the editable/persisted
// variant is a separate workstream. Reusing the existing
// `focus.solo.sessionInsight.*` translation keys avoids new JSON churn.
const DEFAULT_GOAL = 4;
const DEFAULT_COMPLETED = 3;

interface TasksPanelProps {
  /** Optional override for the daily 🍅 goal pill. Defaults to 4. */
  goal?: number;
  /** Optional override for completed-pomodoros count. Defaults to 3. */
  completed?: number;
}

/**
 * Solo-room tasks + today's goal in one panel.
 *
 * Round-4 merge: absorbs the goal-progress strip that previously lived
 * in `SessionInsight.tsx`. SRP stays clean — this panel still has one
 * job ("show what you intend to get done today"), it just covers both
 * the per-day 🍅 target and the per-session task list under one
 * pixel-panel.
 *
 * Local state only — tasks reset per session, goal is decorative for
 * now. Persistent goals + backend wiring are tracked as follow-ups so
 * the shape is in place for a future `useGoalStore`.
 */
export function TasksPanel({
  goal = DEFAULT_GOAL,
  completed = DEFAULT_COMPLETED,
}: TasksPanelProps = {}) {
  const t = useTranslations("focus.solo.tasksPanel");
  const tGoal = useTranslations("focus.solo.sessionInsight");
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
      style={{
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      {/* Today's goal — segmented progress strip + counter */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span
            className="font-silkscreen"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              fontSize: 10,
              color: "var(--ink-mute)",
              letterSpacing: "0.18em",
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
            ● {tGoal("goalLabel", { goal })}
          </span>
          <span
            className="font-silkscreen"
            style={{
              fontSize: 10,
              color: "var(--accent)",
              letterSpacing: "0.15em",
            }}
          >
            {tGoal("progressCounter", { done: completed, goal })}
          </span>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {Array.from({ length: goal }).map((_, i) => {
            const isDone = i < completed;
            const isCursor = i === completed;
            return (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: 12,
                  border: "1px solid var(--panel-stroke)",
                  background: isDone ? "var(--accent)" : "rgba(0,0,0,0.4)",
                  boxShadow: isDone ? "0 0 6px var(--accent)" : "none",
                  position: "relative",
                }}
              >
                <span
                  className="font-silkscreen"
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 9,
                    color: isDone ? "#0a0524" : "var(--ink-dim)",
                  }}
                >
                  {isDone ? "✓" : isCursor ? tGoal("hereLabel") : ""}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Divider — dashed line so the goal block reads as its own section */}
      <div
        aria-hidden
        style={{
          height: 0,
          borderTop: "1px dashed var(--panel-stroke)",
          margin: "2px 0",
        }}
      />

      {/* Tasks header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
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

      {/* Task rows */}
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

      {/* Add-task input */}
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
