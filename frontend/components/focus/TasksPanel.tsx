"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { DailyGoalStrip } from "./SessionInsight";

interface Task {
  id: string;
  label: string;
  done: boolean;
}

/**
 * Solo-room tasks list. The today's-goal strip (formerly inside
 * SessionInsight) now lives in this panel's header per the QA round-1
 * restructure. Supports add / toggle / edit / delete in-memory only;
 * persistence is a future ticket.
 */
export function TasksPanel() {
  const t = useTranslations("focus.solo.tasksPanel");
  const [tasks, setTasks] = useState<Task[]>(() => [
    { id: "t1", label: t("seed.t1"), done: false },
    { id: "t2", label: t("seed.t2"), done: true },
    { id: "t3", label: t("seed.t3"), done: false },
    { id: "t4", label: t("seed.t4"), done: false },
  ]);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

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

  const remove = (id: string) =>
    setTasks((prev) => prev.filter((task) => task.id !== id));

  const startEdit = (task: Task) => {
    setEditingId(task.id);
    setEditDraft(task.label);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft("");
  };

  const commitEdit = (id: string) => {
    const trimmed = editDraft.trim();
    if (!trimmed) {
      cancelEdit();
      return;
    }
    setTasks((prev) =>
      prev.map((task) =>
        task.id === id ? { ...task, label: trimmed } : task,
      ),
    );
    cancelEdit();
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
      {/* Today's goal strip — merged in from the standalone insight card.
          Wired live to the task list: chip count == tasks.length, filled ==
          tasks.filter(done) so add/remove/toggle reflects immediately. */}
      <DailyGoalStrip goal={tasks.length} completed={done} />

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
        {tasks.map((task) => {
          const isEditing = editingId === task.id;
          return (
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
              {isEditing ? (
                <input
                  autoFocus
                  className="pixel-input"
                  value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      commitEdit(task.id);
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      cancelEdit();
                    }
                  }}
                  onBlur={() => commitEdit(task.id)}
                  data-testid={`task-edit-input-${task.id}`}
                  style={{ flex: 1, fontSize: 11, padding: "2px 6px" }}
                />
              ) : (
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
              )}
              {isEditing ? null : (
                <>
                  <button
                    type="button"
                    aria-label={t("editAria")}
                    data-testid={`task-edit-${task.id}`}
                    onClick={() => startEdit(task)}
                    className="font-silkscreen"
                    style={{
                      width: 20,
                      height: 20,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      color: "var(--accent-3)",
                      background: "transparent",
                      border: "1px solid var(--panel-stroke)",
                      cursor: "pointer",
                      flexShrink: 0,
                    }}
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    aria-label={t("deleteAria")}
                    data-testid={`task-delete-${task.id}`}
                    onClick={() => remove(task.id)}
                    className="font-silkscreen"
                    style={{
                      width: 20,
                      height: 20,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      color: "#f472b6",
                      background: "transparent",
                      border: "1px solid var(--panel-stroke)",
                      cursor: "pointer",
                      flexShrink: 0,
                    }}
                  >
                    ✕
                  </button>
                </>
              )}
            </div>
          );
        })}
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
