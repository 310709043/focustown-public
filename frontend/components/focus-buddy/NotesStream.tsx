"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { notesApi, type NoteWithShare } from "@/lib/api/endpoints";

const AUTOSAVE_DEBOUNCE_MS = 1000;
const DEFAULT_TEMPLATE = `# 共同筆記 · 寫作番茄場
( 兩人都可以編輯 )

## 約定
- 25 min 寫，5 min 休息對唸
- 不開鏡頭只開麥
- 完成就互按 ✦
`;

interface NotesStreamProps {
  matchId: string;
}

/**
 * Buddy-room shared notes — single full-height VT323 textarea backed by
 * `notesApi` with `shared_in_match_id = matchId`. Reuses the existing
 * shared-note persistence pattern from Page 4's `SharedNotesPanel` data
 * layer. The "Aria 正在編輯第 8 行" sync indicator is decorative this PR
 * (real OT/CRDT is multi-week separate work).
 *
 * Reference: screen-buddy.jsx:L421-L465.
 */
export function NotesStream({ matchId }: NotesStreamProps) {
  const t = useTranslations("focus.buddy.notes");
  const [body, setBody] = useState("");
  const [noteId, setNoteId] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load the latest shared note for this match. If none exists, leave
  // the textarea blank (avoid overwriting an empty state with the seed
  // template — the seed becomes the placeholder instead).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await notesApi.list({ matchId });
        const shared = list.find((n: NoteWithShare) => n.shared_in_match_id === matchId);
        if (!cancelled && shared) {
          setNoteId(shared.id);
          setBody(shared.body ?? "");
        }
      } catch {
        /* tolerate transient failures — user can still draft */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [matchId]);

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
            shared_in_match_id: matchId,
          });
          setNoteId(created.id);
        }
        setSavedAt(Date.now());
      } catch {
        /* next edit will retry */
      }
    }, AUTOSAVE_DEBOUNCE_MS);
  };

  return (
    <div
      data-testid="notes-stream"
      style={{ display: "flex", flexDirection: "column", height: "100%" }}
    >
      <textarea
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
          scheduleSave(e.target.value);
        }}
        placeholder={DEFAULT_TEMPLATE}
        style={{
          flex: 1,
          background: "rgba(7,4,26,0.5)",
          color: "var(--ink)",
          border: "none",
          borderBottom: "1px solid var(--panel-stroke)",
          fontFamily: 'var(--font-vt323), "Noto Sans TC", monospace',
          fontSize: 17,
          lineHeight: 1.45,
          padding: 16,
          resize: "none",
          outline: "none",
        }}
      />
      <div
        style={{
          padding: "6px 12px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "rgba(7,4,26,0.6)",
        }}
      >
        <div
          className="font-silkscreen"
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            fontSize: 9,
            color: "var(--ink-dim)",
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
          <span>{t("partnerEditing", { line: 8 })}</span>
        </div>
        <span
          className="font-silkscreen"
          style={{ fontSize: 9, color: "var(--ink-dim)" }}
        >
          {savedAt ? t("autoSaved") : t("autoSavedIdle")}
        </span>
      </div>
    </div>
  );
}
