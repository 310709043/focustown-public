/**
 * useLbtStore — applies transport events and sends intents.
 *
 * Worth testing (the UI's promises): nothing starts without the 18+ check
 * or while closed; the clock follows the server's end time and raises the
 * time-up dialog once; both sides must agree to extend; ended/idle events
 * always land somewhere sensible; user text is passed through as text.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { MESSAGE_MAX, SESSION_SECONDS, TOPIC_IDS, TYPING_THROTTLE_MS } from "@/lib/lbt/constants";
import { remainingSeconds, useLbtStore } from "@/lib/lbt/sessionStore";

import { FakeTransport, matched, PARTNER } from "./fakeTransport";

const store = () => useLbtStore.getState();
let transport: FakeTransport;
let detach: () => void;

function walkIn(nickname = "小橘") {
  store().setAdult(true);
  store().startWaiting(nickname);
}

function inChat(endsInMs?: number) {
  walkIn();
  transport.emit(matched(endsInMs));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-03T13:00:00Z"));
  store().reset();
  transport = new FakeTransport();
  detach = store().attach(transport);
});

afterEach(() => {
  detach();
  store().reset();
  vi.useRealTimers();
});

describe("attaching", () => {
  test("takes the transport's mode", () => {
    detach();
    detach = store().attach(new FakeTransport("demo"));

    expect(store().mode).toBe("demo");
  });

  test("detaching stops the transport", () => {
    detach();

    expect(transport.stopped).toBe(true);
  });

  test("connection events are reflected", () => {
    transport.emit({ type: "connection", state: "offline" });

    expect(store().connection).toBe("offline");
  });
});

describe("walking in", () => {
  test("is refused without the 18+ confirmation", () => {
    store().startWaiting("小橘");

    expect({ view: store().view, notice: store().notice, sent: transport.ops() }).toEqual({
      view: "home",
      notice: "age_required",
      sent: [],
    });
  });

  test("is refused while the town is closed", () => {
    store().setAdult(true);
    store().setTown({ online: 3, waiting: 0, open: false, hours: "21:00-24:00" });

    store().startWaiting("小橘");

    expect({ view: store().view, notice: store().notice }).toEqual({ view: "home", notice: "closed" });
  });

  test("sends the profile and moves to the waiting view", () => {
    store().setEnergy(3);
    store().setPreference("story");

    walkIn("小橘");

    expect({ view: store().view, join: transport.calls[0] }).toEqual({
      view: "waiting",
      join: {
        op: "join",
        arg: { nickname: "小橘", energy: 3, preference: "story", adult: true },
      },
    });
  });

  test("ticking the age box clears the age notice", () => {
    store().startWaiting("x");

    store().setAdult(true);

    expect(store().notice).toBeNull();
  });

  test("cancelling the wait tells the transport and goes home", () => {
    walkIn();

    store().cancelWaiting();

    expect({ view: store().view, last: transport.ops().at(-1) }).toEqual({
      view: "home",
      last: "cancel",
    });
  });

  test.each(["closed", "age_required", "invalid_energy"])(
    "a %s error from the server sends the visitor home",
    (code) => {
      walkIn();

      transport.emit({ type: "error", code });

      expect({ view: store().view, notice: store().notice }).toEqual({ view: "home", notice: code });
    },
  );

  test("a slow_down error keeps the visitor where they are", () => {
    inChat();

    transport.emit({ type: "error", code: "slow_down" });

    expect({ view: store().view, notice: store().notice }).toEqual({
      view: "chat",
      notice: "slow_down",
    });
  });
});

describe("matching", () => {
  test("opens the chat with the partner's profile and the seed notes", () => {
    walkIn();

    transport.emit(matched());

    expect({
      view: store().view,
      partner: store().partner,
      lines: store().lines.map((l) => (l.kind === "system" ? l.code : l.kind)),
    }).toEqual({ view: "chat", partner: PARTNER, lines: ["met", "energyShown"] });
  });

  test("records whether the partner is the demo script", () => {
    walkIn();

    transport.emit(matched(420_000, true));

    expect(store().simulated).toBe(true);
  });

  test("the clock starts from the server's end time", () => {
    inChat(420_000);

    expect(remainingSeconds(store())).toBe(SESSION_SECONDS);
  });

  test("a waiting event never pulls an open chat back to waiting", () => {
    inChat();

    transport.emit({ type: "waiting" });

    expect(store().view).toBe("chat");
  });
});

describe("clock", () => {
  test("counts down as time passes", () => {
    inChat(420_000);

    vi.advanceTimersByTime(5000);

    expect(remainingSeconds(store())).toBe(415);
  });

  test("one second before the end there is no time-up dialog", () => {
    inChat(10_000);

    vi.advanceTimersByTime(9000);

    expect(store().modal).toBeNull();
  });

  test("at the end the time-up dialog opens", () => {
    inChat(10_000);

    vi.advanceTimersByTime(10_000);

    expect({ remaining: remainingSeconds(store()), modal: store().modal }).toEqual({
      remaining: 0,
      modal: { type: "timeUp" },
    });
  });

  test("the time-up dialog opens only once per window", () => {
    inChat(5000);
    vi.advanceTimersByTime(5000);
    store().closeModal();

    vi.advanceTimersByTime(10_000);

    expect(store().modal).toBeNull();
  });

  test("outside a chat the remaining time reads as a full window", () => {
    expect(remainingSeconds(store())).toBe(SESSION_SECONDS);
  });
});

describe("messages", () => {
  test.each(["", "   ", "\n\t"])("blank input %j is not sent", (raw) => {
    inChat();

    expect({ accepted: store().sendMessage(raw), sent: transport.ops().includes("send") }).toEqual({
      accepted: false,
      sent: false,
    });
  });

  test("text is trimmed before sending", () => {
    inChat();

    store().sendMessage("  今天有點累  ");

    expect(transport.calls.at(-1)).toEqual({ op: "send", arg: "今天有點累" });
  });

  test("text over the limit is cut to the limit", () => {
    inChat();

    store().sendMessage("字".repeat(MESSAGE_MAX + 20));

    expect((transport.calls.at(-1)?.arg as string).length).toBe(MESSAGE_MAX);
  });

  test("nothing is sent outside a chat", () => {
    expect(store().sendMessage("hello")).toBe(false);
  });

  test("nothing is sent once time is up", () => {
    inChat(1000);
    vi.advanceTimersByTime(1000);

    expect(store().sendMessage("one more")).toBe(false);
  });

  test("my echoed message is appended as my own text", () => {
    inChat();

    transport.emit({ type: "message", id: "m1", from: "me", text: "<b>hi</b>" });

    expect(store().lines.at(-1)).toEqual({ id: "m1", kind: "me", text: "<b>hi</b>" });
  });

  test("a partner message is appended and stops the typing dots", () => {
    inChat();
    transport.emit({ type: "typing" });

    transport.emit({ type: "message", id: "m2", from: "partner", text: "嗨" });

    expect({ last: store().lines.at(-1), typing: store().partnerTyping }).toEqual({
      last: { id: "m2", kind: "partner", text: "嗨", ref: undefined },
      typing: false,
    });
  });

  test("a replayed message id is not duplicated", () => {
    inChat();
    transport.emit({ type: "message", id: "m1", from: "me", text: "hi" });

    transport.emit({ type: "message", id: "m1", from: "me", text: "hi" });

    expect(store().lines.filter((l) => l.id === "m1")).toHaveLength(1);
  });

  test("a message arriving outside a chat is ignored", () => {
    transport.emit({ type: "message", id: "m1", from: "partner", text: "hi" });

    expect(store().lines).toEqual([]);
  });

  test("the typing dots clear on their own", () => {
    inChat();
    transport.emit({ type: "typing" });

    vi.advanceTimersByTime(4000);

    expect(store().partnerTyping).toBe(false);
  });

  test("my typing is throttled", () => {
    inChat();

    store().notifyTyping();
    store().notifyTyping();
    vi.advanceTimersByTime(TYPING_THROTTLE_MS);
    store().notifyTyping();

    expect(transport.ops().filter((op) => op === "typing")).toHaveLength(2);
  });
});

describe("extending", () => {
  test("asking sends the intent", () => {
    inChat();

    store().extend();

    expect(transport.ops().at(-1)).toBe("extend");
  });

  test("asking again after the server confirmed my request sends nothing", () => {
    inChat();
    store().extend();
    transport.emit({ type: "extendRequested", by: "me" });

    store().extend();

    expect(transport.ops().filter((op) => op === "extend")).toHaveLength(1);
  });

  test("the partner's request is shown so I can agree", () => {
    inChat();

    transport.emit({ type: "extendRequested", by: "partner" });

    expect({
      partner: store().extendPartner,
      note: store().lines.at(-1),
    }).toEqual({
      partner: true,
      note: expect.objectContaining({ kind: "system", code: "extendPartnerAsked" }),
    });
  });

  test("the agreed extension moves the end and clears both requests", () => {
    inChat(60_000);
    transport.emit({ type: "extendRequested", by: "me" });
    transport.emit({ type: "extendRequested", by: "partner" });

    transport.emit({ type: "extended", endsAt: Date.now() + 480_000 });

    expect({
      remaining: remainingSeconds(store()),
      mine: store().extendMine,
      partner: store().extendPartner,
    }).toEqual({ remaining: 480, mine: false, partner: false });
  });

  test("extending from the time-up dialog closes it", () => {
    inChat(1000);
    vi.advanceTimersByTime(1000);

    store().extend();

    expect(store().modal).toBeNull();
  });

  test("an extension after time-up re-arms the time-up dialog for the new window", () => {
    inChat(1000);
    vi.advanceTimersByTime(1000);
    transport.emit({ type: "extended", endsAt: Date.now() + 2000 });

    vi.advanceTimersByTime(2000);

    expect(store().modal).toEqual({ type: "timeUp" });
  });
});

describe("ending", () => {
  test("leaving tells the transport and shows the end screen", () => {
    inChat();

    store().leave();

    expect({ view: store().view, reason: store().endReason, last: transport.ops().at(-1) }).toEqual({
      view: "end",
      reason: "left",
      last: "leave",
    });
  });

  test("the partner leaving ends the chat with their reason", () => {
    inChat();

    transport.emit({ type: "ended", reason: "partner_left" });

    expect({ view: store().view, reason: store().endReason }).toEqual({
      view: "end",
      reason: "partner_left",
    });
  });

  test("the clock stops at the end", () => {
    inChat();
    transport.emit({ type: "ended", reason: "timeout" });
    const frozen = store().now;

    vi.advanceTimersByTime(5000);

    expect(store().now).toBe(frozen);
  });

  test("an unsent report closes when the conversation ends", () => {
    inChat();
    store().openModal({ type: "report" });
    transport.emit({ type: "ended", reason: "partner_left" });
    expect(store().modal).toBeNull();
  });

  test("a report already sending can finish after the end event", async () => {
    inChat();
    store().openModal({ type: "report" });
    const pending = store().report("spam", "ads");
    transport.emit({ type: "ended", reason: "reported" });
    expect(store().modal).toEqual({ type: "report" });
    await expect(pending).resolves.toBe("sent");
    expect(store().reportPending).toBe(false);
    expect([store().partner, store().lines]).toEqual([null, []]);
  });

  test("a failed in-flight report clears its draft dialog if the chat ended", async () => {
    inChat();
    store().openModal({ type: "report" });
    transport.reportResult = new Error("report_500");
    const pending = store().report("spam", "private draft");
    transport.emit({ type: "ended", reason: "partner_left" });
    await expect(pending).rejects.toThrow("report_500");
    expect(store().modal).toBeNull();
    expect(store().reportPending).toBe(false);
  });

  test.each(["partner_left", "timeout", "partner_disconnected"] as const)("%s clears chat data and ignores late messages", (reason) => {
    inChat();
    transport.emit({ type: "message", id: "secret", from: "partner", text: "private" });
    transport.emit({ type: "ended", reason });
    transport.emit({ type: "message", id: "late", from: "partner", text: "late private" });
    expect([store().partner, store().lines]).toEqual([null, []]);
  });

  test("reports cannot start after leaving", async () => {
    inChat();
    store().leave();
    expect([store().partner, store().lines]).toEqual([null, []]);
    await expect(store().report("spam", "")).rejects.toThrow("no_conversation");
  });

  test("idle during a chat means it ended while we were away", () => {
    inChat();

    transport.emit({ type: "idle" });

    expect({ view: store().view, reason: store().endReason }).toEqual({ view: "end", reason: null });
  });

  test("idle while waiting sends the visitor home with a notice", () => {
    walkIn();

    transport.emit({ type: "idle" });

    expect({ view: store().view, notice: store().notice }).toEqual({
      view: "home",
      notice: "wait_interrupted",
    });
  });

  test("again walks back in with the same nickname", () => {
    inChat();
    store().leave();

    store().again();

    expect(transport.calls.at(-1)).toEqual({
      op: "join",
      arg: expect.objectContaining({ nickname: "小橘" }),
    });
  });

  test("going home from a chat leaves it", () => {
    inChat();

    store().goHome();

    expect({ view: store().view, last: transport.ops().at(-1) }).toEqual({
      view: "home",
      last: "leave",
    });
  });

  test("going home while waiting cancels the wait", () => {
    walkIn();

    store().goHome();

    expect(transport.ops().at(-1)).toBe("cancel");
  });
});

describe("reports, topics and dialogs", () => {
  test("a report goes through the transport", async () => {
    inChat();

    await store().report("spam", "ads");

    expect(transport.calls.at(-1)).toEqual({ op: "report", arg: { reason: "spam", note: "ads" } });
  });

  test("a failed report rejects so the dialog can say so", async () => {
    inChat();
    transport.reportResult = new Error("report_500");

    await expect(store().report("spam", "")).rejects.toThrow("report_500");
  });

  test("topics walk through the list and wrap around", () => {
    for (let i = 0; i <= TOPIC_IDS.length; i += 1) store().drawTopic();

    expect(store().topicId).toBe(TOPIC_IDS[0]);
  });

  test("reset keeps the mode and clears everything else", () => {
    inChat();

    store().reset();

    expect({ view: store().view, lines: store().lines, mode: store().mode, adult: store().adult }).toEqual({
      view: "home",
      lines: [],
      mode: "live",
      adult: false,
    });
  });
});
