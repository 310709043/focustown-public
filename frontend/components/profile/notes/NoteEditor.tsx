"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

interface NoteEditorProps {
  initial: { title: string; body: string };
  onSave: (input: { title: string; body: string }) => void;
  onCancel: () => void;
}

export function NoteEditor({ initial, onSave, onCancel }: NoteEditorProps) {
  const t = useTranslations("profile.notes");
  const [title, setTitle] = useState(initial.title);
  const [body, setBody] = useState(initial.body);

  return (
    <form
      data-testid="note-editor"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ title: title.trim(), body });
      }}
      className="pixel-panel"
      style={{
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        background: "rgba(20,10,55,0.55)",
      }}
    >
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t("titlePlaceholder")}
        className="pixel-input"
        maxLength={80}
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={t("bodyPlaceholder")}
        maxLength={10000}
        rows={4}
        className="pixel-input"
        style={{
          resize: "vertical",
          fontFamily: "var(--font-vt323), ui-monospace, monospace",
          fontSize: 13,
          lineHeight: 1.5,
        }}
      />
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button
          type="button"
          onClick={onCancel}
          className="font-silkscreen"
          style={{
            padding: "6px 12px",
            fontSize: 10,
            letterSpacing: "0.22em",
            color: "var(--ink-mute)",
            background: "transparent",
            border: "1px solid var(--panel-stroke)",
            cursor: "pointer",
          }}
        >
          {t("cancelCta")}
        </button>
        <button
          type="submit"
          className="pixel-btn font-silkscreen"
          style={{
            padding: "6px 14px",
            fontSize: 11,
            letterSpacing: "0.25em",
            background: "var(--accent)",
            borderColor: "var(--accent)",
            color: "#0c0524",
            cursor: "pointer",
          }}
        >
          {t("saveCta")}
        </button>
      </div>
    </form>
  );
}
