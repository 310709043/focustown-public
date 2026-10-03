import { create } from "zustand";

import {
  MESSAGE_MAX,
  PARTNER_TYPING_CLEAR_MS,
  SESSION_SECONDS,
  TOPIC_IDS,
  TYPING_THROTTLE_MS,
} from "./constants";
import type { LbtTransport, TransportEvent } from "./transport";
import type {
  ChatLine,
  ConnectionState,
  EndReason,
  Energy,
  LbtModal,
  LbtMode,
  LbtView,
  PeerProfile,
  Preference,
  ReportReason,
  SystemCode,
  TopicId,
  TownStatus,
} from "./types";

/**
 * LowBatteryTown session state.
 *
 * The store never decides who the partner is or when a chat ends: it sends
 * intents to an `LbtTransport` (live backend or labelled demo script) and
 * applies the events that come back. It keeps ids and codes, not localised
 * strings, so the UI renders copy in the active locale.
 */

interface LbtData {
  mode: LbtMode;
  view: LbtView;
  energy: Energy;
  preference: Preference;
  /** Committed when the visitor walks in; empty until then. */
  nickname: string;
  adult: boolean;
  connection: ConnectionState;
  town: TownStatus | null;
  partner: PeerProfile | null;
  /** True when the partner is the demo script, never a person. */
  simulated: boolean;
  lines: ChatLine[];
  /** Local-clock ms when the current window ends; null outside a chat. */
  endsAt: number | null;
  now: number;
  partnerTyping: boolean;
  extendMine: boolean;
  extendPartner: boolean;
  topicId: TopicId | null;
  topicCursor: number;
  modal: LbtModal | null;
  endReason: EndReason | null;
  /** Machine-readable notice (error code) shown inline; null when none. */
  notice: string | null;
  timeUpShown: boolean;
  waitingSince: number | null;
}

interface LbtActions {
  attach: (transport: LbtTransport) => () => void;
  setEnergy: (energy: Energy) => void;
  setPreference: (preference: Preference) => void;
  setAdult: (adult: boolean) => void;
  setTown: (town: TownStatus | null) => void;
  startWaiting: (nickname: string) => void;
  cancelWaiting: () => void;
  again: () => void;
  goHome: () => void;
  leave: () => void;
  sendMessage: (raw: string) => boolean;
  notifyTyping: () => void;
  extend: () => void;
  report: (reason: ReportReason, note: string) => Promise<"sent" | "simulated">;
  drawTopic: () => void;
  dismissTopic: () => void;
  openModal: (modal: LbtModal) => void;
  closeModal: () => void;
  dismissNotice: () => void;
  /** Apply one transport event. Exposed for tests and the transport only. */
  handle: (event: TransportEvent) => void;
  reset: () => void;
}

export type LbtState = LbtData & LbtActions;

const INITIAL: LbtData = {
  mode: "live",
  view: "home",
  energy: 1,
  preference: "casual",
  nickname: "",
  adult: false,
  connection: "idle",
  town: null,
  partner: null,
  simulated: false,
  lines: [],
  endsAt: null,
  now: 0,
  partnerTyping: false,
  extendMine: false,
  extendPartner: false,
  topicId: null,
  topicCursor: 0,
  modal: null,
  endReason: null,
  notice: null,
  timeUpShown: false,
  waitingSince: null,
};

/** Codes that mean "you can't be in the waiting room right now". */
const SEND_HOME = new Set(["closed", "age_required", "nickname_required", "invalid_energy", "invalid_preference"]);

/** Seconds left in the current window (full window outside a chat). */
export function remainingSeconds(state: Pick<LbtData, "endsAt" | "now">): number {
  if (state.endsAt === null) return SESSION_SECONDS;
  return Math.max(0, Math.ceil((state.endsAt - state.now) / 1000));
}

let transport: LbtTransport | null = null;
let tick: ReturnType<typeof setInterval> | undefined;
let typingClear: ReturnType<typeof setTimeout> | undefined;
let lastTypingSent = 0;
let systemSeq = 0;

function stopClock() {
  clearInterval(tick);
  tick = undefined;
}

function system(code: SystemCode): ChatLine {
  systemSeq += 1;
  return { id: `sys-${systemSeq}`, kind: "system", code };
}

export const useLbtStore = create<LbtState>()((set, get) => {
  const startClock = () => {
    stopClock();
    set({ now: Date.now() });
    tick = setInterval(() => {
      const state = get();
      if (state.view !== "chat") return;
      const now = Date.now();
      const crossedZero =
        state.endsAt !== null && now >= state.endsAt && !state.timeUpShown;
      set(
        crossedZero
          ? { now, timeUpShown: true, modal: state.modal ?? { type: "timeUp" } }
          : { now },
      );
    }, 1000);
  };

  const toEnd = (reason: EndReason | null) => {
    stopClock();
    clearTimeout(typingClear);
    set((s) => ({
      view: "end",
      endReason: reason,
      partnerTyping: false,
      extendMine: false,
      extendPartner: false,
      topicId: null,
      endsAt: null,
      waitingSince: null,
      // A report confirmation stays open over the end screen.
      modal: s.modal?.type === "report" ? s.modal : null,
    }));
  };

  const handle = (event: TransportEvent) => {
    const state = get();
    switch (event.type) {
      case "connection":
        set({ connection: event.state });
        return;
      case "waiting":
        if (state.view !== "chat") set({ view: "waiting", waitingSince: state.waitingSince ?? Date.now() });
        return;
      case "matched":
        set({
          view: "chat",
          partner: event.partner,
          simulated: event.simulated,
          nickname: event.me.nickname || state.nickname,
          endsAt: event.endsAt,
          lines: [system("met"), system("energyShown")],
          partnerTyping: false,
          extendMine: false,
          extendPartner: false,
          topicId: null,
          modal: null,
          endReason: null,
          notice: null,
          timeUpShown: Date.now() >= event.endsAt,
          waitingSince: null,
        });
        startClock();
        return;
      case "message": {
        if (state.view !== "chat" || state.lines.some((l) => l.id === event.id)) return;
        const line: ChatLine =
          event.from === "me"
            ? { id: event.id, kind: "me", text: event.text ?? "" }
            : { id: event.id, kind: "partner", text: event.text, ref: event.ref };
        if (event.from === "partner") clearTimeout(typingClear);
        set((s) => ({
          lines: [...s.lines, line],
          partnerTyping: event.from === "partner" ? false : s.partnerTyping,
        }));
        return;
      }
      case "typing":
        if (state.view !== "chat") return;
        clearTimeout(typingClear);
        set({ partnerTyping: true });
        typingClear = setTimeout(() => set({ partnerTyping: false }), PARTNER_TYPING_CLEAR_MS);
        return;
      case "extendRequested":
        if (state.view !== "chat") return;
        if (event.by === "me") {
          if (state.extendMine) return;
          set((s) => ({ extendMine: true, lines: [...s.lines, system("extendAsked")] }));
        } else {
          if (state.extendPartner) return;
          set((s) => ({ extendPartner: true, lines: [...s.lines, system("extendPartnerAsked")] }));
        }
        return;
      case "extended":
        if (state.view !== "chat") return;
        set((s) => ({
          endsAt: event.endsAt,
          now: Date.now(),
          extendMine: false,
          extendPartner: false,
          timeUpShown: false,
          modal: s.modal?.type === "timeUp" ? null : s.modal,
          lines: [...s.lines, system("extendAccepted")],
        }));
        return;
      case "ended":
        if (state.view === "chat" || state.view === "waiting") toEnd(event.reason);
        return;
      case "idle":
        // The server has no session for us (e.g. it ended while we were
        // offline). Reconcile instead of showing a chat that is gone.
        if (state.view === "chat") toEnd(null);
        else if (state.view === "waiting") set({ view: "home", waitingSince: null, notice: "wait_interrupted" });
        return;
      case "error":
        set({ notice: event.code });
        if (state.view === "waiting" && SEND_HOME.has(event.code)) {
          set({ view: "home", waitingSince: null });
        }
        return;
    }
  };

  return {
    ...INITIAL,

    attach(next) {
      transport = next;
      set({ mode: next.mode });
      const stop = next.start(handle);
      return () => {
        stop();
        if (transport === next) transport = null;
      };
    },

    setEnergy: (energy) => set({ energy }),
    setPreference: (preference) => set({ preference }),
    setAdult: (adult) => set({ adult, notice: get().notice === "age_required" ? null : get().notice }),
    setTown: (town) => set({ town }),

    startWaiting(nickname) {
      const state = get();
      if (!state.adult) {
        set({ notice: "age_required" });
        return;
      }
      if (state.town && !state.town.open) {
        set({ notice: "closed" });
        return;
      }
      set({
        view: "waiting",
        nickname,
        lines: [],
        partner: null,
        endReason: null,
        notice: null,
        modal: null,
        waitingSince: Date.now(),
      });
      transport?.join({
        nickname,
        energy: state.energy,
        preference: state.preference,
        adult: state.adult,
      });
    },

    cancelWaiting() {
      transport?.cancel();
      set({ view: "home", waitingSince: null });
    },

    again() {
      get().startWaiting(get().nickname);
    },

    goHome() {
      const { view } = get();
      if (view === "chat") transport?.leave();
      if (view === "waiting") transport?.cancel();
      stopClock();
      set({
        view: "home",
        endsAt: null,
        partner: null,
        modal: null,
        topicId: null,
        waitingSince: null,
        extendMine: false,
        extendPartner: false,
      });
    },

    leave() {
      if (get().view !== "chat") return;
      transport?.leave();
      toEnd("left");
    },

    sendMessage(raw) {
      const state = get();
      const text = Array.from(raw.trim()).slice(0, MESSAGE_MAX).join("");
      if (!text || state.view !== "chat" || remainingSeconds(state) === 0) return false;
      transport?.send(text);
      return true;
    },

    notifyTyping() {
      if (get().view !== "chat") return;
      const now = Date.now();
      if (now - lastTypingSent < TYPING_THROTTLE_MS) return;
      lastTypingSent = now;
      transport?.typing();
    },

    extend() {
      const state = get();
      if (state.view !== "chat" || state.extendMine) return;
      transport?.extend();
      if (state.modal?.type === "timeUp") set({ modal: null });
    },

    async report(reason, note) {
      if (!transport) return "simulated";
      return transport.report(reason, note);
    },

    drawTopic() {
      const { topicCursor } = get();
      set({ topicId: TOPIC_IDS[topicCursor % TOPIC_IDS.length], topicCursor: topicCursor + 1 });
    },
    dismissTopic: () => set({ topicId: null }),

    openModal: (modal) => set({ modal }),
    closeModal: () => set({ modal: null }),
    dismissNotice: () => set({ notice: null }),

    handle,

    reset() {
      stopClock();
      clearTimeout(typingClear);
      lastTypingSent = 0;
      set({ ...INITIAL, mode: get().mode });
    },
  };
});
