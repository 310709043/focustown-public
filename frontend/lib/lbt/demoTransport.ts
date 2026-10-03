import {
  DEMO_PARTNER_ENERGY,
  EXTEND_ACCEPT_DELAY_MS,
  OPENER_DELAY_MS,
  REPLY_DELAY_MS,
  REPLY_IDS,
  SESSION_SECONDS,
  WAIT_MS,
} from "./constants";
import type { JoinRequest, LbtTransport, TransportListener } from "./transport";
import type { Preference, TownStatus } from "./types";

/**
 * Demo transport: a scripted, clearly labelled partner ("simulated").
 * Used by the public prototype; nothing leaves the page. An optional
 * `statusSource` supplies a real count (e.g. people viewing the page).
 */

const COMPLEMENT: Record<Preference, Preference> = {
  casual: "casual",
  listen: "story",
  story: "listen",
};

export interface DemoTransportOptions {
  statusSource?: () => TownStatus | null;
  now?: () => number;
}

export function createDemoTransport(options: DemoTransportOptions = {}): LbtTransport {
  const now = options.now ?? (() => Date.now());
  let listener: TransportListener | null = null;
  let seq = 0;
  let replyCursor = 0;
  let endsAt = 0;
  let inChat = false;
  let extendPending = false;
  let replyTimer: ReturnType<typeof setTimeout> | undefined;
  const timers = new Set<ReturnType<typeof setTimeout>>();

  const emit: TransportListener = (event) => listener?.(event);
  const nextId = () => `demo-${(seq += 1)}`;

  function later(ms: number, fn: () => void): ReturnType<typeof setTimeout> {
    const handle = setTimeout(() => {
      timers.delete(handle);
      fn();
    }, ms);
    timers.add(handle);
    return handle;
  }

  function clearAll() {
    timers.forEach(clearTimeout);
    timers.clear();
    replyTimer = undefined;
    inChat = false;
    extendPending = false;
  }

  return {
    mode: "demo",
    answerCompanion() { /* Only a live human administrator can offer a chat. */ },
    start(next) {
      listener = next;
      emit({ type: "connection", state: "open" });
      return () => {
        clearAll();
        listener = null;
      };
    },
    join(request: JoinRequest) {
      clearAll();
      if (!request.adult) {
        emit({ type: "error", code: "age_required" });
        return;
      }
      emit({ type: "waiting" });
      later(WAIT_MS, () => {
        inChat = true;
        replyCursor = 0;
        endsAt = now() + SESSION_SECONDS * 1000;
        emit({
          type: "matched",
          me: {
            nickname: request.nickname,
            energy: request.energy,
            preference: request.preference,
          },
          // Name and copy come from the UI's localised demo partner.
          partner: {
            nickname: "",
            energy: DEMO_PARTNER_ENERGY,
            preference: COMPLEMENT[request.preference],
          },
          simulated: true,
          endsAt,
          graceSeconds: 60,
        });
        emit({ type: "typing" });
        later(OPENER_DELAY_MS, () => {
          if (inChat) emit({ type: "message", id: nextId(), from: "partner", ref: { type: "opener" } });
        });
      });
    },
    cancel() {
      clearAll();
      emit({ type: "idle" });
    },
    send(text) {
      if (!inChat) return;
      emit({ type: "message", id: nextId(), from: "me", text });
      emit({ type: "typing" });
      // Only one pending reply at a time: a new message restarts the wait.
      if (replyTimer !== undefined) {
        clearTimeout(replyTimer);
        timers.delete(replyTimer);
      }
      replyTimer = later(REPLY_DELAY_MS, () => {
        replyTimer = undefined;
        if (!inChat) return;
        const id = REPLY_IDS[replyCursor % REPLY_IDS.length];
        replyCursor += 1;
        emit({ type: "message", id: nextId(), from: "partner", ref: { type: "reply", id } });
      });
    },
    typing() {
      /* nobody to tell */
    },
    extend() {
      if (!inChat || extendPending) return;
      extendPending = true;
      emit({ type: "extendRequested", by: "me" });
      later(EXTEND_ACCEPT_DELAY_MS, () => {
        if (!inChat) return;
        extendPending = false;
        endsAt = Math.max(now(), endsAt) + SESSION_SECONDS * 1000;
        emit({ type: "extended", endsAt });
      });
    },
    leave() {
      const wasInChat = inChat;
      clearAll();
      if (wasInChat) emit({ type: "ended", reason: "left" });
    },
    async report() {
      return "simulated";
    },
    async status() {
      return options.statusSource?.() ?? null;
    },
  };
}
