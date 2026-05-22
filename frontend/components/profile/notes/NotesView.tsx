"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Modal } from "@/components/modals/Modal";
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
  const tButtons = useTranslations("common.buttons");
  const [notes, setNotes] = useState<NoteWithShare[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const page = await notesApi.list();
      setNotes(page.items);
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

  const handleDelete = (id: string) => {
    setPendingDeleteId(id);
  };

  const cancelDelete = () => {
    if (deleting) return;
    setPendingDeleteId(null);
  };

  const confirmDelete = async () => {
    if (!pendingDeleteId || deleting) return;
    setDeleting(true);
    try {
      await notesApi.remove(pendingDeleteId);
      setPendingDeleteId(null);
      await reload();
    } catch {
      pushErrorToast(t("saveError"));
    } finally {
      setDeleting(false);
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

      <Modal
        open={pendingDeleteId !== null}
        onClose={cancelDelete}
        title={t("deleteConfirmTitle")}
        accent="#f472b6"
        width="min(420px, 92vw)"
        testId="notes-delete-confirm"
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 18,
          }}
        >
          <p
            className="font-silkscreen"
            style={{
              margin: 0,
              fontSize: 12,
              letterSpacing: "0.18em",
              color: "var(--ink)",
              lineHeight: 1.7,
            }}
          >
            {t("deleteConfirm")}
          </p>
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
            }}
          >
            <button
              type="button"
              data-testid="notes-delete-cancel"
              onClick={cancelDelete}
              disabled={deleting}
              className="font-silkscreen disabled:opacity-60 disabled:cursor-not-allowed"
              style={{
                padding: "8px 16px",
                fontSize: 11,
                letterSpacing: "0.22em",
                color: "var(--ink-mute)",
                background: "transparent",
                border: "1px solid var(--panel-stroke)",
                cursor: "pointer",
              }}
            >
              {tButtons("cancel")}
            </button>
            <button
              type="button"
              data-testid="notes-delete-confirm"
              onClick={confirmDelete}
              disabled={deleting}
              className="font-silkscreen disabled:opacity-60 disabled:cursor-not-allowed"
              style={{
                padding: "8px 16px",
                fontSize: 11,
                letterSpacing: "0.22em",
                color: "#0c0524",
                background: "#f472b6",
                border: "1px solid #f472b6",
                cursor: "pointer",
                boxShadow: "0 0 8px rgba(244,114,182,0.5)",
              }}
            >
              {deleting ? "…" : tButtons("delete")}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
