"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { notesApi, type NoteWithShare } from "@/lib/api/endpoints";
import { pushErrorToast } from "@/lib/state/toastStore";

import { NoteEditor } from "./NoteEditor";
import { NoteListItem } from "./NoteListItem";

interface NotesViewProps {
  onClose: () => void;
}

export function NotesView({ onClose }: NotesViewProps) {
  const t = useTranslations("profile.notes");
  const tModal = useTranslations("profile.modal");
  const [notes, setNotes] = useState<NoteWithShare[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await notesApi.list();
      setNotes(rows);
    } catch {
      pushErrorToast(t("loadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleSave = async (input: { title: string; body: string }, id: string | "new") => {
    try {
      if (id === "new") {
        await notesApi.create(input);
      } else {
        await notesApi.update(id, input);
      }
      setEditingId(null);
      await reload();
    } catch {
      pushErrorToast(t("saveError"));
    }
  };

  const handleDelete = async (id: string) => {
    if (typeof window !== "undefined" && !window.confirm(t("deleteConfirm"))) return;
    try {
      await notesApi.remove(id);
      await reload();
    } catch {
      pushErrorToast(t("saveError"));
    }
  };

  const handleToggleDone = async (note: NoteWithShare) => {
    try {
      await notesApi.update(note.id, { done: !note.done });
      await reload();
    } catch {
      pushErrorToast(t("saveError"));
    }
  };

  return (
    <div
      data-testid="notes-view"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 14,
        padding: "20px 24px",
        overflowY: "auto",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span
          className="font-silkscreen"
          style={{
            fontSize: 12,
            letterSpacing: "0.32em",
            color: "var(--accent-2)",
          }}
        >
          ● {t("title")}
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            data-testid="notes-new"
            onClick={() => setEditingId("new")}
            className="pixel-btn font-silkscreen"
            style={{ padding: "6px 12px", fontSize: 11, letterSpacing: "0.22em" }}
          >
            {t("newCta")}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label={tModal("closeAria")}
            className="font-silkscreen"
            style={{
              padding: "6px 12px",
              fontSize: 11,
              letterSpacing: "0.25em",
              color: "var(--ink-mute)",
              background: "transparent",
              border: "1px solid var(--panel-stroke)",
              cursor: "pointer",
            }}
          >
            ✕ {tModal("close")}
          </button>
        </div>
      </header>

      {editingId === "new" ? (
        <NoteEditor
          initial={{ title: "", body: "" }}
          onSave={(input) => handleSave(input, "new")}
          onCancel={() => setEditingId(null)}
        />
      ) : null}

      {loading ? (
        <div
          className="font-silkscreen"
          style={{
            padding: "24px 12px",
            border: "1px dashed var(--panel-stroke)",
            fontSize: 11,
            letterSpacing: "0.22em",
            color: "var(--ink-mute)",
            textAlign: "center",
          }}
        >
          ◌ {t("loading")}
        </div>
      ) : notes.length === 0 && editingId !== "new" ? (
        <div
          className="font-silkscreen"
          style={{
            padding: "24px 12px",
            border: "1px dashed var(--panel-stroke)",
            fontSize: 11,
            letterSpacing: "0.18em",
            color: "var(--ink-mute)",
            textAlign: "center",
            lineHeight: 1.7,
          }}
        >
          {t("emptyState")}
        </div>
      ) : (
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {notes.map((note) =>
            editingId === note.id ? (
              <li key={note.id}>
                <NoteEditor
                  initial={{ title: note.title ?? "", body: note.body ?? "" }}
                  onSave={(input) => handleSave(input, note.id)}
                  onCancel={() => setEditingId(null)}
                />
              </li>
            ) : (
              <NoteListItem
                key={note.id}
                note={note}
                onEdit={() => setEditingId(note.id)}
                onDelete={() => handleDelete(note.id)}
                onToggleDone={() => handleToggleDone(note)}
              />
            ),
          )}
        </ul>
      )}
    </div>
  );
}
