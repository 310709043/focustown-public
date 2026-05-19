"use client";

import { useTranslations } from "next-intl";

import type { NoteWithShare } from "@/lib/api/endpoints";

interface NoteListItemProps {
  note: NoteWithShare;
  onEdit: () => void;
  onDelete: () => void;
  onToggleDone: () => void;
}

export function NoteListItem({ note, onEdit, onDelete, onToggleDone }: NoteListItemProps) {
  const t = useTranslations("profile.notes");
  const title = note.title?.trim() || t("untitled");

  return (
    <li
      data-testid="note-row"
      className="pixel-panel"
      style={{
        display: "grid",
        gridTemplateColumns: "20px 1fr auto",
        gap: 10,
        padding: "10px 12px",
        background: "rgba(20,10,55,0.4)",
        alignItems: "flex-start",
      }}
    >
      <button
        type="button"
        onClick={onToggleDone}
        aria-label={t("doneToggleAria")}
        aria-pressed={note.done}
        style={{
          width: 16,
          height: 16,
          marginTop: 3,
          background: note.done ? "var(--accent)" : "rgba(0,0,0,0.4)",
          border: "1px solid var(--panel-stroke-strong)",
          color: "#0c0524",
          fontSize: 10,
          lineHeight: 1,
          cursor: "pointer",
        }}
      >
        {note.done ? "✓" : ""}
      </button>

      <div style={{ minWidth: 0 }}>
        <div
          className="font-silkscreen"
          style={{
            fontSize: 12,
            letterSpacing: "0.14em",
            color: note.done ? "var(--ink-dim)" : "var(--ink)",
            textDecoration: note.done ? "line-through" : "none",
            marginBottom: 4,
          }}
        >
          {title}
        </div>
        {note.body ? (
          <pre
            style={{
              margin: 0,
              fontFamily: "var(--font-vt323), ui-monospace, monospace",
              fontSize: 12,
              lineHeight: 1.6,
              color: "var(--ink-mute)",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {note.body}
          </pre>
        ) : null}
      </div>

      <div style={{ display: "flex", gap: 4 }}>
        <button
          type="button"
          onClick={onEdit}
          aria-label={t("editAria")}
          className="font-silkscreen"
          style={{
            padding: "4px 8px",
            fontSize: 10,
            letterSpacing: "0.18em",
            color: "var(--ink-mute)",
            background: "rgba(20,10,55,0.65)",
            border: "1px solid var(--panel-stroke)",
            cursor: "pointer",
          }}
        >
          ✎
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label={t("deleteAria")}
          className="font-silkscreen"
          style={{
            padding: "4px 8px",
            fontSize: 10,
            letterSpacing: "0.18em",
            color: "#f472b6",
            background: "rgba(20,10,55,0.65)",
            border: "1px solid var(--panel-stroke)",
            cursor: "pointer",
          }}
        >
          ✕
        </button>
      </div>
    </li>
  );
}
