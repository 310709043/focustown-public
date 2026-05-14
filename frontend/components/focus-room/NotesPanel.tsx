"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { clsx } from "clsx";

import { notesApi } from "@/lib/api/endpoints";
import type { Note } from "@/lib/api/types.gen";

export function NotesPanel() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [filter, setFilter] = useState<"all" | "todo">("all");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const t = useTranslations("focus.notes");

  const reload = async () => {
    try {
      setNotes(await notesApi.list());
    } catch {
      /* unauth or offline; leave list */
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const visible = filter === "all" ? notes : notes.filter((n) => !n.done);

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-[rgba(5,1,20,.6)] backdrop-blur-md">
      <div className="px-3.5 py-2.5 border-b border-border text-[10px] text-muted flex justify-between">
        <span>{t("title")}</span>
        <span>{t("countLabel", { count: notes.length })}</span>
      </div>
      <div className="flex gap-1 px-3 py-2 border-b border-border flex-wrap">
        {(["all", "todo"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={clsx(
              "text-[10px] px-2 py-0.5 rounded border font-japan",
              filter === k ? "border-accent-1 text-accent-1" : "border-border text-muted",
            )}
          >
            {k === "all" ? t("filterAll") : t("filterTodo")}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-3.5 flex flex-col gap-2 min-h-0">
        {visible.length === 0 ? (
          <div className="text-[11px] text-muted text-center mt-6 leading-loose">
            {t("emptyLine1")}
            <br />
            {t("emptyLine2")}
          </div>
        ) : (
          visible.map((n) => (
            <button
              key={n.id}
              className="text-left bg-[rgba(20,10,50,.6)] border border-border rounded px-3 py-2 hover:border-accent-1"
              style={{ opacity: n.done ? 0.5 : 1 }}
              onClick={async () => {
                await notesApi.update(n.id, { done: !n.done });
                await reload();
              }}
            >
              <div className="text-[11px] font-medium mb-0.5">
                {n.done ? "✓ " : ""}
                {n.title || t("untitled")}
              </div>
              {n.body ? (
                <div className="text-[11px] text-muted line-clamp-2 leading-snug">{n.body}</div>
              ) : null}
            </button>
          ))
        )}
      </div>
      <div className="px-3 py-2 border-t border-border flex flex-col gap-1">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("titlePlaceholder")}
          className="bg-[rgba(12,5,35,.9)] border border-border rounded-t text-[11px] px-2.5 py-1.5 outline-none focus:border-accent-1"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t("bodyPlaceholder")}
          className="bg-[rgba(12,5,35,.9)] border border-border rounded-b text-[12px] px-2.5 py-1.5 outline-none focus:border-accent-1 resize-none h-16 leading-snug font-body"
        />
        <button
          className="w-full border border-border text-muted text-[10px] py-1 rounded font-japan hover:border-accent-1 hover:text-accent-1"
          onClick={async () => {
            if (!title.trim() && !body.trim()) return;
            await notesApi.create({ title: title.trim() || t("untitled"), body: body.trim() });
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
