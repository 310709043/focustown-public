"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { ApiError } from "@/lib/api/client";
import { matchAgendaApi, type MatchAgendaItem } from "@/lib/api/endpoints";
import { useRealtime } from "@/lib/ws/useRealtime";
import { pushErrorToast } from "@/lib/state/toastStore";

import { PixelCheckbox } from "./PixelCheckbox";

interface SharedAgendaProps {
  matchId: string;
}

interface AgendaEvent {
  type: string;
  match_id?: string;
  id?: string;
  position?: number;
  body?: string;
  status?: MatchAgendaItem["status"];
  checked_by?: string | null;
}

/**
 * Shared agenda checklist for the matched focus room. Backed by
 * /api/v1/matches/{id}/agenda. Updates fan-out via Redis pub/sub
 * on the room:{match_id} channel; the FE subscribes through the
 * existing useRealtime hook and patches its local list in place.
 */
export function SharedAgenda({ matchId }: SharedAgendaProps) {
  const t = useTranslations("focus.buddy.agenda");
  const [items, setItems] = useState<MatchAgendaItem[]>([]);
  const [draft, setDraft] = useState("");

  const reload = useCallback(async () => {
    try {
      const res = await matchAgendaApi.list(matchId);
      setItems(res.items);
    } catch {
      pushErrorToast(t("loadError"));
    }
  }, [matchId, t]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useRealtime((msg) => {
    const payload = msg as AgendaEvent;
    if (!payload || payload.match_id !== matchId) return;
    if (payload.type === "agenda.item_added" && payload.id && payload.body) {
      setItems((prev) => {
        if (prev.some((it) => it.id === payload.id)) return prev;
        const optimistic: MatchAgendaItem = {
          id: payload.id!,
          match_id: matchId,
          position: payload.position ?? prev.length,
          body: payload.body!,
          status: (payload.status ?? "pending") as MatchAgendaItem["status"],
          created_by: payload.checked_by ?? "",
          checked_by: null,
          checked_at: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        return [...prev, optimistic].sort((a, b) => a.position - b.position);
      });
      return;
    }
    if (payload.type === "agenda.item_updated" && payload.id) {
      setItems((prev) =>
        prev.map((it) =>
          it.id === payload.id
            ? {
                ...it,
                body: payload.body ?? it.body,
                status: (payload.status ?? it.status) as MatchAgendaItem["status"],
                position: payload.position ?? it.position,
                checked_by: payload.checked_by ?? it.checked_by,
              }
            : it,
        ),
      );
      return;
    }
    if (payload.type === "agenda.item_removed" && payload.id) {
      setItems((prev) => prev.filter((it) => it.id !== payload.id));
    }
  });

  const toggle = async (item: MatchAgendaItem) => {
    const nextStatus: MatchAgendaItem["status"] =
      item.status === "done" ? "pending" : "done";
    // Optimistic local update; WS push will reconcile.
    setItems((prev) =>
      prev.map((it) => (it.id === item.id ? { ...it, status: nextStatus } : it)),
    );
    try {
      await matchAgendaApi.update(matchId, item.id, { status: nextStatus });
    } catch (err) {
      pushErrorToast(
        err instanceof ApiError ? err.message : t("saveError"),
      );
      void reload();
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    try {
      const created = await matchAgendaApi.create(matchId, body);
      setItems((prev) => [...prev, created].sort((a, b) => a.position - b.position));
    } catch {
      pushErrorToast(t("saveError"));
    }
  };

  const doneCount = items.filter((it) => it.status === "done").length;

  return (
    <div
      data-testid="shared-agenda"
      className="pixel-panel"
      style={{ padding: 12, display: "flex", flexDirection: "column", gap: 6 }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span
          className="font-silkscreen"
          style={{
            fontSize: 10,
            color: "var(--accent)",
            letterSpacing: "0.2em",
          }}
        >
          ● {t("header")}
        </span>
        <span
          className="font-silkscreen"
          style={{ fontSize: 9, color: "var(--ink-dim)" }}
        >
          {doneCount} / {items.length}
        </span>
      </div>

      {items.map((it) => {
        const done = it.status === "done";
        const inProgress = it.status === "in_progress";
        return (
          <div
            key={it.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "4px 6px",
              background: inProgress
                ? "rgba(236,72,153,0.1)"
                : "rgba(0,0,0,0.3)",
              border: `1px solid ${inProgress ? "var(--accent-2)" : "var(--panel-stroke)"}`,
              cursor: "pointer",
              boxShadow: inProgress ? "var(--neon-glow-pink)" : "none",
            }}
            onClick={() => void toggle(it)}
          >
            <PixelCheckbox checked={done} onToggle={() => void toggle(it)} />
            <span
              className="font-silkscreen"
              style={{
                flex: 1,
                fontSize: 11,
                color: done ? "var(--ink-dim)" : "var(--ink)",
                textDecoration: done ? "line-through" : "none",
              }}
            >
              {it.body}
            </span>
            {inProgress ? (
              <span
                className="font-silkscreen"
                style={{
                  fontSize: 8,
                  color: "var(--accent-2)",
                  letterSpacing: "0.2em",
                  textShadow: "var(--neon-glow-pink)",
                }}
              >
                {t("nowLabel")}
              </span>
            ) : null}
          </div>
        );
      })}

      <form onSubmit={handleAdd} style={{ display: "flex", gap: 6, marginTop: 4 }}>
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t("addPlaceholder")}
          className="pixel-input"
          style={{ flex: 1, fontSize: 11 }}
          maxLength={280}
        />
        <button
          type="submit"
          className="pixel-btn primary"
          style={{ padding: "0 14px", fontSize: 11 }}
        >
          +
        </button>
      </form>
    </div>
  );
}
