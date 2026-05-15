"use client";

/**
 * Matched-focus-room notepad with a private / shared toggle.
 *
 * Replaces ``ChatPanel`` for paired sessions per the new product
 * direction: less ephemeral talking, more durable note-taking.
 *
 * Two tabs:
 * - **私人 (Private)**: notes the *current user* owns and has not
 *   shared. Same scope as the solo ``NotesPanel``.
 * - **共享 (Shared)**: notes any partner has shared into this match —
 *   includes both partners' contributions. Authoring a shared note
 *   sets ``shared_in_match_id`` to the match id.
 *
 * Auth lives server-side: ``NoteService`` rejects share/list requests
 * if the requester is not a member of the match. We assume this page
 * is only mounted when ``matchId`` is the route param (and therefore
 * the user is a member, else the WS gate / focus session creation
 * would have rejected them earlier).
 */

import { clsx } from "clsx";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { notesApi, type NoteWithShare } from "@/lib/api/endpoints";

interface Props {
  matchId: string;
  myUserId: string;
}

type Scope = "private" | "shared";

export function SharedNotesPanel({ matchId, myUserId }: Props) {
  const [notes, setNotes] = useState<NoteWithShare[]>([]);
  const [scope, setScope] = useState<Scope>("shared");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [shareNext, setShareNext] = useState(true);
  const t = useTranslations("focus.notes");

  const reload = async () => {
    try {
      setNotes(await notesApi.list({ matchId }));
    } catch {
      /* tolerate transient failures */
    }
  };

  useEffect(() => {
    void reload();
    // Reset author-side state when switching matches.
    setTitle("");
    setBody("");
    setShareNext(true);
    setScope("shared");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  // Partition once per render — server returns owner-or-match-shared.
  const visible = notes.filter((n) => {
    if (scope === "private") {
      return !n.shared_in_match_id && n.user_id === myUserId;
    }
    return n.shared_in_match_id === matchId;
  });

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-[rgba(5,1,20,.6)] backdrop-blur-md">
      <div className="px-3.5 py-2.5 border-b border-border text-[10px] text-muted flex justify-between">
        <span>{t("title")}</span>
        <span>{t("countLabel", { count: visible.length })}</span>
      </div>
      <div className="flex gap-1.5 md:gap-1 px-3 py-2 border-b border-border flex-wrap">
        <ScopeTab
          active={scope === "shared"}
          label="共享"
          onClick={() => setScope("shared")}
        />
        <ScopeTab
          active={scope === "private"}
          label="私人"
          onClick={() => setScope("private")}
        />
      </div>
      <div className="flex-1 overflow-y-auto p-3.5 flex flex-col gap-2 min-h-0">
        {visible.length === 0 ? (
          <div className="text-[11px] text-muted text-center mt-6 leading-loose">
            {scope === "shared" ? "共享筆記是空的" : t("emptyLine1")}
            <br />
            {scope === "shared" ? "勾選『與夥伴共享』來分享" : t("emptyLine2")}
          </div>
        ) : (
          visible.map((n) => (
            <NoteCard
              key={n.id}
              note={n}
              myUserId={myUserId}
              onToggleDone={async () => {
                await notesApi.update(n.id, { done: !n.done });
                await reload();
              }}
              onToggleShare={async () => {
                if (n.user_id !== myUserId) return; // only owner can flip
                await notesApi.update(n.id, {
                  shared_in_match_id: n.shared_in_match_id ? null : matchId,
                });
                await reload();
              }}
            />
          ))
        )}
      </div>
      <div className="px-3 py-2 border-t border-border flex flex-col gap-1">
        <input
          data-testid="shared-note-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("titlePlaceholder")}
          className="bg-[rgba(12,5,35,.9)] border border-border rounded-t text-[11px] px-2.5 py-1.5 outline-none focus:border-accent-1"
        />
        <textarea
          data-testid="shared-note-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t("bodyPlaceholder")}
          className="bg-[rgba(12,5,35,.9)] border border-border rounded-b text-[12px] px-2.5 py-1.5 outline-none focus:border-accent-1 resize-none h-16 leading-snug font-body"
        />
        <label className="flex items-center gap-1.5 text-[10px] text-muted font-japan select-none">
          <input
            type="checkbox"
            checked={shareNext}
            onChange={(e) => setShareNext(e.target.checked)}
          />
          與夥伴共享
        </label>
        <button
          className="w-full border border-border text-muted text-[10px] py-2 touch:py-2.5 touch:min-h-[40px] md:py-1 rounded font-japan hover:border-accent-1 hover:text-accent-1 active:border-accent-1 active:text-accent-1"
          onClick={async () => {
            if (!title.trim() && !body.trim()) return;
            await notesApi.create({
              title: title.trim() || t("untitled"),
              body: body.trim(),
              shared_in_match_id: shareNext ? matchId : null,
            });
            setTitle("");
            setBody("");
            await reload();
          }}
        >
          {t("addCta")}
        </button>
      </div>
    </div>
  );
}

function ScopeTab({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "text-[10px] px-2.5 py-1.5 touch:py-2 touch:min-h-[36px] md:py-0.5 md:px-2 rounded border font-japan transition-colors",
        active
          ? "border-accent-1 text-accent-1"
          : "border-border text-muted active:border-accent-1/60",
      )}
    >
      {label}
    </button>
  );
}

function NoteCard({
  note,
  myUserId,
  onToggleDone,
  onToggleShare,
}: {
  note: NoteWithShare;
  myUserId: string;
  onToggleDone: () => void | Promise<void>;
  onToggleShare: () => void | Promise<void>;
}) {
  const isMine = note.user_id === myUserId;
  return (
    <div
      className="text-left bg-[rgba(20,10,50,.6)] border border-border rounded px-3 py-2"
      style={{ opacity: note.done ? 0.5 : 1 }}
    >
      <button
        type="button"
        className="text-left w-full"
        onClick={() => void onToggleDone()}
      >
        <div className="text-[11px] font-medium mb-0.5">
          {note.done ? "✓ " : ""}
          {note.title || "未命名"}
        </div>
        {note.body ? (
          <div className="text-[11px] text-muted line-clamp-2 leading-snug">
            {note.body}
          </div>
        ) : null}
      </button>
      <div className="flex justify-between items-center mt-1 text-[9px]">
        <span className="text-muted">
          {isMine ? "我寫的" : "夥伴"}
          {note.shared_in_match_id ? " · 共享中" : " · 私人"}
        </span>
        {isMine ? (
          <button
            type="button"
            onClick={() => void onToggleShare()}
            className="text-accent-1 hover:underline"
          >
            {note.shared_in_match_id ? "改為私人" : "改為共享"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
