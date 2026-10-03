/**
 * useLbtStore — the simulated LowBatteryTown session.
 *
 * Worth testing (these rules are the product's promises):
 * - waiting → chat happens after a fixed delay, and cancelling never opens a chat
 * - the 7-minute clock counts down, stops at zero, and raises the time-up modal
 * - extending needs the (simulated) other side, can't be stacked, and survives
 *   being asked at zero
 * - leaving or going home stops every timer (no ghost replies or ticks)
 * - only the visitor's own words are stored as text; partner/system lines are ids
 *
 * NOT worth testing: the exact reply wording (localised in messages/*.json).
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  EXTEND_ACCEPT_DELAY_MS,
  MESSAGE_MAX,
  OPENER_DELAY_MS,
  REPLY_DELAY_MS,
  REPLY_IDS,
  SESSION_SECONDS,
  TOPIC_IDS,
  WAIT_MS,
} from "@/lib/lbt/constants";
import { useLbtStore } from "@/lib/lbt/sessionStore";

const get = () => useLbtStore.getState();
const tick = (ms: number) => vi.advanceTimersByTime(ms);

/** Walk the store into an open chat with the opener delivered. */
function enterChat(nickname = "小橘") {
  get().startWaiting(nickname);
  tick(WAIT_MS);
  tick(OPENER_DELAY_MS);
}

beforeEach(() => {
  vi.useFakeTimers();
  get().reset();
});

afterEach(() => {
  get().reset();
  vi.useRealTimers();
});

describe("waiting room", () => {
  test("startWaiting moves to the waiting view with the committed nickname", () => {
    get().startWaiting("小橘");

    expect({ view: get().view, nickname: get().nickname }).toEqual({
      view: "waiting",
      nickname: "小橘",
    });
  });

  test("still waiting one tick before the delay ends", () => {
    get().startWaiting("小橘");

    tick(WAIT_MS - 1);

    expect(get().view).toBe("waiting");
  });

  test("the chat opens exactly when the delay ends", () => {
    get().startWaiting("小橘");

    tick(WAIT_MS);

    expect(get().view).toBe("chat");
  });

  test("cancelling the wait never opens a chat later", () => {
    get().startWaiting("小橘");
    get().goHome();

    tick(WAIT_MS * 3);

    expect(get().view).toBe("home");
  });

  test("restarting the wait restarts the full delay", () => {
    get().startWaiting("小橘");
    tick(WAIT_MS - 500);
    get().startWaiting("小橘");
    tick(500);

    expect(get().view).toBe("waiting");
  });
});

describe("chat start", () => {
  test("opens with the full window and the two seed notes", () => {
    get().startWaiting("小橘");
    tick(WAIT_MS);

    expect({
      remaining: get().remaining,
      lines: get().lines.map((l) => (l.kind === "system" ? l.code : l.kind)),
    }).toEqual({ remaining: SESSION_SECONDS, lines: ["met", "energyShown"] });
  });

  test("the partner is typing until the opener arrives", () => {
    get().startWaiting("小橘");
    tick(WAIT_MS);

    expect(get().openerPending).toBe(true);
  });

  test("the opener arrives after its delay and clears the typing flag", () => {
    get().startWaiting("小橘");
    tick(WAIT_MS);
    tick(OPENER_DELAY_MS);

    expect({
      typing: get().openerPending,
      last: get().lines.at(-1),
    }).toEqual({ typing: false, last: { id: 2, kind: "partner", ref: { type: "opener" } } });
  });

  test("a fresh chat after an earlier one starts from a clean transcript", () => {
    enterChat();
    get().sendMessage("hello");
    get().leave();
    get().again();
    tick(WAIT_MS);

    expect(get().lines.map((l) => l.kind)).toEqual(["system", "system"]);
  });

  test("again keeps the nickname from the previous chat", () => {
    enterChat("小橘");
    get().leave();

    get().again();

    expect({ view: get().view, nickname: get().nickname }).toEqual({
      view: "waiting",
      nickname: "小橘",
    });
  });
});

describe("session clock", () => {
  test("counts down one second per second", () => {
    enterChat();
    const before = get().remaining;

    tick(5000);

    expect(before - get().remaining).toBe(5);
  });

  test("one second before the end there is no modal yet", () => {
    get().startWaiting("小橘");
    tick(WAIT_MS);

    tick((SESSION_SECONDS - 1) * 1000);

    expect({ remaining: get().remaining, modal: get().modal }).toEqual({
      remaining: 1,
      modal: null,
    });
  });

  test("at zero the time-up modal opens", () => {
    get().startWaiting("小橘");
    tick(WAIT_MS);

    tick(SESSION_SECONDS * 1000);

    expect({ remaining: get().remaining, modal: get().modal }).toEqual({
      remaining: 0,
      modal: { type: "timeUp" },
    });
  });

  test("the clock stops at zero instead of going negative", () => {
    get().startWaiting("小橘");
    tick(WAIT_MS);

    tick((SESSION_SECONDS + 30) * 1000);

    expect(get().remaining).toBe(0);
  });
});

describe("sending messages", () => {
  test.each([
    ["an empty string", ""],
    ["only spaces", "   "],
    ["only a newline and tab", "\n\t"],
  ])("%s is rejected and adds nothing", (_label, text) => {
    enterChat();
    const before = get().lines.length;

    const accepted = get().sendMessage(text);

    expect({ accepted, added: get().lines.length - before }).toEqual({
      accepted: false,
      added: 0,
    });
  });

  test("is rejected outside the chat view", () => {
    expect(get().sendMessage("hello")).toBe(false);
  });

  test("is rejected once time is up", () => {
    get().startWaiting("小橘");
    tick(WAIT_MS);
    tick(SESSION_SECONDS * 1000);

    expect(get().sendMessage("one more thing")).toBe(false);
  });

  test("is stored trimmed, as the visitor's own text", () => {
    enterChat();

    get().sendMessage("  今天有點累  ");

    expect(get().lines.at(-1)).toMatchObject({ kind: "me", text: "今天有點累" });
  });

  test("markup is kept verbatim as text, never interpreted", () => {
    enterChat();

    get().sendMessage("<img src=x onerror=alert(1)>");

    expect(get().lines.at(-1)).toMatchObject({
      kind: "me",
      text: "<img src=x onerror=alert(1)>",
    });
  });

  test("a message at the length limit is kept whole", () => {
    enterChat();

    get().sendMessage("字".repeat(MESSAGE_MAX));

    expect((get().lines.at(-1) as { text: string }).text).toHaveLength(MESSAGE_MAX);
  });

  test("a message over the length limit is cut to the limit", () => {
    enterChat();

    get().sendMessage("字".repeat(MESSAGE_MAX + 50));

    expect((get().lines.at(-1) as { text: string }).text).toHaveLength(MESSAGE_MAX);
  });

  test("the partner shows typing, then answers with a scripted reply id", () => {
    enterChat();
    get().sendMessage("hi");

    const typing = get().replyPending;
    tick(REPLY_DELAY_MS);

    expect({ typing, afterTyping: get().replyPending, last: get().lines.at(-1) }).toEqual({
      typing: true,
      afterTyping: false,
      last: expect.objectContaining({
        kind: "partner",
        ref: { type: "reply", id: REPLY_IDS[0] },
      }),
    });
  });

  test("replies walk through the script in order and wrap around", () => {
    enterChat();
    const ids: string[] = [];

    for (let i = 0; i < REPLY_IDS.length + 1; i += 1) {
      get().sendMessage(`message ${i}`);
      tick(REPLY_DELAY_MS);
      const last = get().lines.at(-1);
      if (last?.kind === "partner" && last.ref.type === "reply") ids.push(last.ref.id);
    }

    expect(ids).toEqual([...REPLY_IDS, REPLY_IDS[0]]);
  });

  test("messages sent in quick succession get a single reply", () => {
    enterChat();

    get().sendMessage("one");
    tick(REPLY_DELAY_MS - 100);
    get().sendMessage("two");
    tick(REPLY_DELAY_MS);

    const replies = get().lines.filter(
      (l) => l.kind === "partner" && l.ref.type === "reply",
    );
    expect(replies).toHaveLength(1);
  });

  test("leaving before the reply lands cancels it", () => {
    enterChat();
    get().sendMessage("hi");
    const countBefore = get().lines.length;

    get().leave();
    tick(REPLY_DELAY_MS * 2);

    expect(get().lines.length).toBe(countBefore);
  });

  test("line ids stay unique and increasing", () => {
    enterChat();
    get().sendMessage("a");
    tick(REPLY_DELAY_MS);
    get().sendMessage("b");

    const ids = get().lines.map((l) => l.id);

    expect(ids).toEqual(ids.map((_, index) => index));
  });
});

describe("extending the chat", () => {
  test("asking marks the request pending and adds a note", () => {
    enterChat();

    get().extend();

    expect({
      pending: get().extendPending,
      last: get().lines.at(-1),
    }).toEqual({
      pending: true,
      last: expect.objectContaining({ kind: "system", code: "extendAsked" }),
    });
  });

  test("seven minutes are added the moment the other side agrees", () => {
    enterChat();
    get().extend();
    tick(EXTEND_ACCEPT_DELAY_MS - 1);
    const justBefore = get().remaining;

    tick(1);

    expect(get().remaining - justBefore).toBe(SESSION_SECONDS);
  });

  test("agreement clears the pending flag and notes it", () => {
    enterChat();

    get().extend();
    tick(EXTEND_ACCEPT_DELAY_MS);

    expect({
      pending: get().extendPending,
      last: get().lines.at(-1),
    }).toEqual({
      pending: false,
      last: expect.objectContaining({ kind: "system", code: "extendAccepted" }),
    });
  });

  test("asking again while pending adds nothing", () => {
    enterChat();
    get().extend();
    const linesAfterFirst = get().lines.length;

    get().extend();

    expect(get().lines.length).toBe(linesAfterFirst);
  });

  test("two completed extensions stack their time", () => {
    get().startWaiting("小橘");
    tick(WAIT_MS);

    get().extend();
    tick(EXTEND_ACCEPT_DELAY_MS);
    get().extend();
    tick(EXTEND_ACCEPT_DELAY_MS);

    // Window + two extensions, minus the one whole second that ticked off
    // during each 1.3 s wait.
    expect(get().remaining).toBe(SESSION_SECONDS * 3 - 2);
  });

  test("asking at zero closes the time-up modal and resumes the clock", () => {
    get().startWaiting("小橘");
    tick(WAIT_MS);
    tick(SESSION_SECONDS * 1000);

    get().extend();
    tick(EXTEND_ACCEPT_DELAY_MS);
    tick(3000);

    expect({ modal: get().modal, remaining: get().remaining }).toEqual({
      modal: null,
      remaining: SESSION_SECONDS - 3,
    });
  });

  test("is ignored outside the chat view", () => {
    get().extend();

    expect(get().extendPending).toBe(false);
  });

  test("leaving while a request is pending cancels the agreement", () => {
    enterChat();
    get().extend();
    const before = get().remaining;

    get().leave();
    tick(EXTEND_ACCEPT_DELAY_MS * 3);

    expect(get().remaining).toBe(before);
  });
});

describe("leaving", () => {
  test("leave goes to the end view and clears the modal", () => {
    enterChat();
    get().openModal({ type: "report" });

    get().leave();

    expect({ view: get().view, modal: get().modal }).toEqual({ view: "end", modal: null });
  });

  test("goHome goes to the home view", () => {
    enterChat();

    get().goHome();

    expect(get().view).toBe("home");
  });

  test("the clock stops ticking after leaving", () => {
    enterChat();
    get().leave();
    const frozen = get().remaining;

    tick(10_000);

    expect(get().remaining).toBe(frozen);
  });

  test("the opener never arrives after leaving early", () => {
    get().startWaiting("小橘");
    tick(WAIT_MS);
    get().leave();

    tick(OPENER_DELAY_MS * 2);

    expect(get().lines.filter((l) => l.kind === "partner")).toHaveLength(0);
  });
});

describe("topic cards", () => {
  test("drawing walks through the topics in order", () => {
    enterChat();
    const seen: Array<string | null> = [];

    for (let i = 0; i < 3; i += 1) {
      get().drawTopic();
      seen.push(get().topicId);
    }

    expect(seen).toEqual(TOPIC_IDS.slice(0, 3));
  });

  test("the topics wrap around after the last one", () => {
    enterChat();

    for (let i = 0; i <= TOPIC_IDS.length; i += 1) get().drawTopic();

    expect(get().topicId).toBe(TOPIC_IDS[0]);
  });

  test("dismissing hides the card", () => {
    enterChat();
    get().drawTopic();

    get().dismissTopic();

    expect(get().topicId).toBeNull();
  });
});

describe("modals and selections", () => {
  test("openModal then closeModal round-trips to no modal", () => {
    get().openModal({ type: "support" });
    const opened = get().modal;

    get().closeModal();

    expect({ opened, closed: get().modal }).toEqual({
      opened: { type: "support" },
      closed: null,
    });
  });

  test("choosing a battery and preference changes only those fields", () => {
    const before = { ...get() };

    get().setEnergy(3);
    get().setPreference("story");

    expect({
      energy: get().energy,
      preference: get().preference,
      view: get().view,
      nickname: get().nickname,
      remaining: get().remaining,
      lines: get().lines,
    }).toEqual({
      energy: 3,
      preference: "story",
      view: before.view,
      nickname: before.nickname,
      remaining: before.remaining,
      lines: before.lines,
    });
  });

  test("appending a line replaces the lines array instead of mutating it", () => {
    enterChat();
    const before = get().lines;

    get().sendMessage("hello");

    expect(get().lines).not.toBe(before);
  });

  test("reset returns every field to its starting value and stops timers", () => {
    enterChat("小橘");
    get().sendMessage("hello");
    get().setEnergy(3);

    get().reset();
    tick(10_000);

    expect({
      view: get().view,
      energy: get().energy,
      nickname: get().nickname,
      remaining: get().remaining,
      lines: get().lines,
    }).toEqual({
      view: "home",
      energy: 1,
      nickname: "",
      remaining: SESSION_SECONDS,
      lines: [],
    });
  });
});
