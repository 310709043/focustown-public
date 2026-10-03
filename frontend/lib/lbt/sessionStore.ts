import { create } from "zustand";

import {
  EXTEND_ACCEPT_DELAY_MS,
  MESSAGE_MAX,
  OPENER_DELAY_MS,
  REPLY_DELAY_MS,
  REPLY_IDS,
  SESSION_SECONDS,
  TOPIC_IDS,
  WAIT_MS,
} from "./constants";
import type {
  ChatLine,
  Energy,
  LbtModal,
  LbtView,
  NewChatLine,
  Preference,
  TopicId,
} from "./types";

/**
 * Simulated LowBatteryTown session.
 *
 * Nothing here talks to a server: the waiting room, the partner and every
 * partner line are scripted. The store holds ids and counters (never
 * localised strings) so the UI layer can render copy in the active locale.
 * Timer handles live in module scope because they are not render state.
 */

interface LbtData {
  view: LbtView;
  energy: Energy;
  preference: Preference;
  /** Committed when the visitor walks in; empty until then. */
  nickname: string;
  remaining: number;
  lines: ChatLine[];
  openerPending: boolean;
  replyPending: boolean;
  extendPending: boolean;
  topicId: TopicId | null;
  modal: LbtModal | null;
  replyCursor: number;
  topicCursor: number;
  nextLineId: number;
}

interface LbtActions {
  setEnergy: (energy: Energy) => void;
  setPreference: (preference: Preference) => void;
  startWaiting: (nickname: string) => void;
  again: () => void;
  goHome: () => void;
  leave: () => void;
  sendMessage: (raw: string) => boolean;
  extend: () => void;
  drawTopic: () => void;
  dismissTopic: () => void;
  openModal: (modal: LbtModal) => void;
  closeModal: () => void;
  reset: () => void;
}

export type LbtState = LbtData & LbtActions;

const INITIAL: LbtData = {
  view: "home",
  energy: 1,
  preference: "casual",
  nickname: "",
  remaining: SESSION_SECONDS,
  lines: [],
  openerPending: false,
  replyPending: false,
  extendPending: false,
  topicId: null,
  modal: null,
  replyCursor: 0,
  topicCursor: 0,
  nextLineId: 0,
};

type Timeout = ReturnType<typeof setTimeout>;
type Interval = ReturnType<typeof setInterval>;

const timers: {
  wait?: Timeout;
  opener?: Timeout;
  reply?: Timeout;
  extend?: Timeout;
  tick?: Interval;
} = {};

function clearTimers(): void {
  clearTimeout(timers.wait);
  clearTimeout(timers.opener);
  clearTimeout(timers.reply);
  clearTimeout(timers.extend);
  clearInterval(timers.tick);
  timers.wait = undefined;
  timers.opener = undefined;
  timers.reply = undefined;
  timers.extend = undefined;
  timers.tick = undefined;
}

/** Everything that must stop when a session ends or restarts. */
const IDLE_SESSION: Pick<
  LbtData,
  "openerPending" | "replyPending" | "extendPending" | "topicId" | "modal"
> = {
  openerPending: false,
  replyPending: false,
  extendPending: false,
  topicId: null,
  modal: null,
};

export const useLbtStore = create<LbtState>()((set, get) => {
  const appendLine = (line: NewChatLine): void => {
    set((s) => ({
      lines: [...s.lines, { ...line, id: s.nextLineId } as ChatLine],
      nextLineId: s.nextLineId + 1,
    }));
  };

  const startTick = (): void => {
    clearInterval(timers.tick);
    timers.tick = setInterval(() => {
      const state = get();
      if (state.view !== "chat") return;
      const remaining = Math.max(0, state.remaining - 1);
      if (remaining === 0) {
        clearInterval(timers.tick);
        timers.tick = undefined;
        set({ remaining, modal: { type: "timeUp" } });
        return;
      }
      set({ remaining });
    }, 1000);
  };

  const startChat = (): void => {
    clearTimers();
    set({
      ...IDLE_SESSION,
      view: "chat",
      remaining: SESSION_SECONDS,
      replyCursor: 0,
      lines: [
        { id: 0, kind: "system", code: "met" },
        { id: 1, kind: "system", code: "energyShown" },
      ],
      nextLineId: 2,
      openerPending: true,
    });
    startTick();
    timers.opener = setTimeout(() => {
      if (get().view !== "chat") return;
      set({ openerPending: false });
      appendLine({ kind: "partner", ref: { type: "opener" } });
    }, OPENER_DELAY_MS);
  };

  const startWaiting = (nickname: string): void => {
    clearTimers();
    set({ ...IDLE_SESSION, view: "waiting", nickname, lines: [] });
    timers.wait = setTimeout(startChat, WAIT_MS);
  };

  const leaveTo = (view: LbtView): void => {
    clearTimers();
    set({ ...IDLE_SESSION, view });
  };

  return {
    ...INITIAL,

    setEnergy: (energy) => set({ energy }),
    setPreference: (preference) => set({ preference }),

    startWaiting,
    again: () => startWaiting(get().nickname),
    goHome: () => leaveTo("home"),
    leave: () => leaveTo("end"),

    sendMessage: (raw) => {
      const state = get();
      const text = Array.from(raw.trim()).slice(0, MESSAGE_MAX).join("");
      if (!text || state.view !== "chat" || state.remaining === 0) return false;

      appendLine({ kind: "me", text });
      clearTimeout(timers.reply);
      set({ replyPending: true });
      timers.reply = setTimeout(() => {
        const current = get();
        if (current.view !== "chat") return;
        const id = REPLY_IDS[current.replyCursor % REPLY_IDS.length];
        set({ replyPending: false, replyCursor: current.replyCursor + 1 });
        appendLine({ kind: "partner", ref: { type: "reply", id } });
      }, REPLY_DELAY_MS);
      return true;
    },

    extend: () => {
      const state = get();
      if (state.view !== "chat" || state.extendPending) return;
      set((s) => ({
        extendPending: true,
        modal: s.modal?.type === "timeUp" ? null : s.modal,
      }));
      appendLine({ kind: "system", code: "extendAsked" });
      timers.extend = setTimeout(() => {
        if (get().view !== "chat") return;
        set((s) => ({
          remaining: s.remaining + SESSION_SECONDS,
          extendPending: false,
          modal: s.modal?.type === "timeUp" ? null : s.modal,
        }));
        appendLine({ kind: "system", code: "extendAccepted" });
        startTick();
      }, EXTEND_ACCEPT_DELAY_MS);
    },

    drawTopic: () => {
      const { topicCursor } = get();
      set({
        topicId: TOPIC_IDS[topicCursor % TOPIC_IDS.length],
        topicCursor: topicCursor + 1,
      });
    },
    dismissTopic: () => set({ topicId: null }),

    openModal: (modal) => set({ modal }),
    closeModal: () => set({ modal: null }),

    reset: () => {
      clearTimers();
      set({ ...INITIAL });
    },
  };
});
