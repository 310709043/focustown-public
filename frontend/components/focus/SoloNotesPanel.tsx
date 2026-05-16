"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { notesApi, type NoteWithShare } from "@/lib/api/endpoints";

const AUTOSAVE_DEBOUNCE_MS = 1000;
const SECONDS_TICK_MS = 5000;
const TOOLBAR: ReadonlyArray<{ id: string; symbol: string }> = [
  { id: "bold", symbol: "B" },
  { id: "italic", symbol: "I" },
  { id: "bullet", symbol: "•" },
  { id: "check", symbol: "✓" },
  { id: "header", symbol: "#" },
];

/**
 * Reference-style single-textarea notes panel. Loads the latest non-shared
 * note on mount, debounces writes to `notesApi.update`, and lazily creates
 * a note on first edit if none exists. Toolbar buttons are decorative
 * (matching the reference) — they bias the textarea toward common
 * markdown punctuation but do not transform the text.
 */
export function SoloNotesPanel() {
  const t = useTranslations("focus.solo.notes");
  const [body, setBody] = useState("");
  const [noteId, setNoteId] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [, setNow] = useState(() => Date.now());
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  // Load latest personal note (skip match-shared notes).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const all = await notesApi.list();
        const personal = (all as NoteWithShare[]).filter((n) => !n.shared_in_match_id);
        const latest = personal[0];
        if (cancelled) return;
        if (latest) {
          setNoteId(latest.id);
          setBody(latest.body ?? "");
        }
      } catch {
        /* unauth or offline — leave empty */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // "N seconds ago" auto-save label needs to re-render even when nothing
  // else changes — bump a `now` state every 5 s.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), SECONDS_TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  const scheduleSave = (next: string) => {
    if (writeTimer.current) clearTimeout(writeTimer.current);
    writeTimer.current = setTimeout(async () => {
      try {
        if (noteId) {
          await notesApi.update(noteId, { body: next });
        } else {
          const created = await notesApi.create({
            title: t("defaultTitle"),
            body: next,
          });
          setNoteId(created.id);
        }
        setSavedAt(Date.now());
      } catch {
        /* swallow; next edit will retry */
      }
    }, AUTOSAVE_DEBOUNCE_MS);
  };

  const onInsert = (symbol: string) => {
    const el = taRef.current;
    if (!el) return;
    const before = body.slice(0, el.selectionStart);
    const after = body.slice(el.selectionEnd);
    const insertion =
      symbol === "B"
        ? "**粗體**"
        : symbol === "I"
          ? "_斜體_"
          : symbol === "•"
            ? "\n• "
            : symbol === "✓"
              ? "\n☐ "
              : "\n# ";
    const next = `${before}${insertion}${after}`;
    setBody(next);
    scheduleSave(next);
  };

  const chars = body.length;
  const lines = body.split("\n").length;
  const savedAgo = savedAt
    ? Math.max(0, Math.round((Date.now() - savedAt) / 1000))
    : null;

  return (
    <div
      data-testid="solo-notes"
      className="pixel-panel"
      style={{
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        flex: 1,
        minHeight: 0,
      }}
    >
      <div
        className="font-silkscreen"
        style={{
          display: "flex",
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
      </div>

      <div style={{ display: "flex", gap: 4 }}>
        {TOOLBAR.map((tb) => (
          <button
            key={tb.id}
            type="button"
            aria-label={t(`toolbar.${tb.id}` as "toolbar.bold")}
            className="font-silkscreen"
            style={{
              width: 22,
              height: 22,
              background: "rgba(0,0,0,0.4)",
              color: "var(--ink-mute)",
              border: "1px solid var(--panel-stroke)",
              fontSize: 10,
              cursor: "pointer",
            }}
            onClick={() => onInsert(tb.symbol)}
          >
            {tb.symbol}
          </button>
        ))}
      </div>

      <textarea
        ref={taRef}
        data-testid="solo-notes-textarea"
        className="pixel-input"
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
          scheduleSave(e.target.value);
        }}
        placeholder={t("placeholder")}
        style={{
          flex: 1,
          minHeight: 160,
          resize: "none",
          fontFamily: 'var(--font-vt323), "Noto Sans TC", monospace',
          fontSize: 17,
          lineHeight: 1.45,
          padding: 12,
        }}
      />

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 10,
          color: "var(--ink-mute)",
          letterSpacing: "0.1em",
        }}
      >
        <span data-testid="solo-notes-autosave">
          {savedAgo === null ? t("notSavedYet") : t("autoSavedAgo", { seconds: savedAgo })}
        </span>
        <span data-testid="solo-notes-count">
          {t("charLineCount", { chars, lines })}
        </span>
      </div>
    </div>
  );
}
