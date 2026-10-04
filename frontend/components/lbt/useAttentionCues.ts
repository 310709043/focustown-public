"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";

import { CHIME_MIN_GAP_MS, makeChimePlayer, type Cue } from "@/lib/lbt/chime";
import { useChimeStore } from "@/lib/lbt/chimeStore";
import { useLbtStore } from "@/lib/lbt/sessionStore";

/** The visitor is looking at this page (tab shown and window focused). */
function attended(): boolean {
  return !document.hidden && document.hasFocus();
}

/**
 * When the visitor has switched away, tell them what happened: someone
 * arrived, the town host invited them, a message came, or the partner asked
 * to extend. A soft chime (if on) and a note in the tab title; nothing at
 * all while they are looking at the page. The title goes back the moment
 * they return.
 */
export function useAttentionCues() {
  const t = useTranslations("lbt.cues");

  useEffect(() => {
    useChimeStore.getState().hydrate();
    const player = makeChimePlayer();
    // Sound needs a gesture: the first click or key press anywhere unlocks it
    // (walking in is one), so a chime can play later in a background tab.
    const unlock = () => player.unlock();
    document.addEventListener("pointerdown", unlock, true);
    document.addEventListener("keydown", unlock, true);

    let baseTitle = document.title;
    let label: string | null = null;
    let unread = 0;
    let lastChime = 0;

    const clear = () => {
      if (label === null) return;
      label = null;
      unread = 0;
      document.title = baseTitle;
    };
    const cue = (sound: Cue, text: string) => {
      if (label === null) baseTitle = document.title;
      label = text;
      document.title = `${text} · ${baseTitle}`;
      const now = Date.now();
      if (
        useChimeStore.getState().enabled &&
        now - lastChime >= CHIME_MIN_GAP_MS
      ) {
        lastChime = now;
        player.play(sound);
      }
    };

    const unsubscribe = useLbtStore.subscribe((state, prev) => {
      if (attended()) return;
      if (prev.view === "waiting" && state.view === "chat") {
        cue("arrive", t("arrived"));
        return;
      }
      if (
        state.companionInvitation &&
        state.companionInvitation.id !== prev.companionInvitation?.id
      ) {
        cue("arrive", t("invited"));
        return;
      }
      if (state.view !== "chat") return;
      if (state.lines.length > prev.lines.length) {
        const fromPartner = state.lines
          .slice(prev.lines.length)
          .filter((line) => line.kind === "partner").length;
        if (fromPartner > 0) {
          unread += fromPartner;
          cue("message", t("messages", { count: unread }));
          return;
        }
      }
      if (state.extendPartner && !prev.extendPartner)
        cue("message", t("extend"));
    });

    const back = () => {
      if (attended()) clear();
    };
    document.addEventListener("visibilitychange", back);
    window.addEventListener("focus", back);

    return () => {
      unsubscribe();
      document.removeEventListener("pointerdown", unlock, true);
      document.removeEventListener("keydown", unlock, true);
      document.removeEventListener("visibilitychange", back);
      window.removeEventListener("focus", back);
      clear();
    };
  }, [t]);
}
