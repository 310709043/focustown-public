/**
 * LowBatteryTown screens driven through the real store and a fake
 * transport. Worth testing: radio semantics, the 18+ gate, nickname
 * handling, the honest head count, partner labels (person vs script),
 * the extend handshake, time-up, the report form and the full walk.
 * NOT worth testing: CSS, animations, localised copy (keys are asserted).
 */
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { ChatView } from "@/components/lbt/ChatView";
import { HomeView } from "@/components/lbt/HomeView";
import { LbtApp } from "@/components/lbt/LbtApp";
import { WaitingView } from "@/components/lbt/WaitingView";
import { useLbtStore } from "@/lib/lbt/sessionStore";

import { FakeTransport, matched } from "../../lib/lbt/fakeTransport";

vi.mock("@/i18n/routing", () => ({
  Link: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a>,
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/",
  routing: { locales: ["zh-TW", "en"] },
}));

const store = () => useLbtStore.getState();
let transport: FakeTransport;
let detach: () => void;

function emit(event: Parameters<FakeTransport["emit"]>[0]) {
  act(() => transport.emit(event));
}

function openChat(simulated = false, endsInMs = 420_000) {
  act(() => {
    store().setAdult(true);
    store().startWaiting("小橘");
    transport.emit(matched(endsInMs, simulated));
  });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false });
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

describe("HomeView", () => {
  test("starts on the lowest battery with one tab stop in the group", () => {
    render(<HomeView />);

    expect(
      screen
        .getAllByRole("radio", { name: /lbt\.energy\./ })
        .map((r) => [r.getAttribute("aria-checked"), r.tabIndex]),
    ).toEqual([
      ["true", 0],
      ["false", -1],
      ["false", -1],
    ]);
  });

  test("ArrowRight moves the selection to the next battery", () => {
    render(<HomeView />);
    const first = screen.getByRole("radio", { name: /energy\.low\.name/ });
    first.focus();

    fireEvent.keyDown(first.parentElement as HTMLElement, { key: "ArrowRight" });

    expect(store().energy).toBe(2);
  });

  test("walking in without ticking 18+ shows the age notice and sends nothing", () => {
    render(<HomeView />);

    fireEvent.click(screen.getByRole("button", { name: /lbt\.home\.start/ }));

    expect([screen.getByRole("alert").textContent, transport.ops()]).toEqual([
      "lbt.notice.age_required×",
      [],
    ]);
  });

  test("ticking 18+ and walking in sends the prefilled nickname", () => {
    render(<HomeView />);
    fireEvent.click(screen.getByRole("checkbox", { name: /lbt\.home\.adult/ }));

    fireEvent.click(screen.getByRole("button", { name: /lbt\.home\.start/ }));

    expect(transport.calls[0]).toEqual({
      op: "join",
      arg: { nickname: "lbt.home.nickname.default", energy: 1, preference: "casual", adult: true },
    });
  });

  test("a nickname longer than the limit is cut before it is sent", () => {
    render(<HomeView />);
    fireEvent.click(screen.getByRole("checkbox", { name: /lbt\.home\.adult/ }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "月".repeat(20) } });

    fireEvent.click(screen.getByRole("button", { name: /lbt\.home\.start/ }));

    expect((transport.calls[0].arg as { nickname: string }).nickname).toBe("月".repeat(12));
  });

  test("shows the real head count when there is one", () => {
    act(() => store().setTown({ online: 12, waiting: 3, open: true, hours: "" }));

    render(<HomeView />);

    expect(screen.getByText('lbt.home.online({"online":12})')).toBeInTheDocument();
  });

  test("shows no head count without a real number", () => {
    render(<HomeView />);

    expect(document.querySelector(".town-count")).toBeNull();
  });

  test("the demo prototype labels the count as people viewing it", () => {
    detach();
    detach = store().attach(new FakeTransport("demo"));
    act(() => store().setTown({ online: 2, waiting: 0, open: true, hours: "" }));

    render(<HomeView />);

    expect(screen.getByText('lbt.home.onlineDemo({"online":2})')).toBeInTheDocument();
  });

  test("when closed the start button is disabled and the hours are shown", () => {
    act(() => store().setTown({ online: 0, waiting: 0, open: false, hours: "21:00-24:00" }));

    render(<HomeView />);

    expect([
      (screen.getByRole("button", { name: /lbt\.home\.start/ }) as HTMLButtonElement).disabled,
      screen.getByText('lbt.home.closed({"hours":"21:00-24:00"})') !== null,
    ]).toEqual([true, true]);
  });
});

describe("WaitingView", () => {
  test("cancelling tells the transport", () => {
    act(() => {
      store().setAdult(true);
      store().startWaiting("小橘");
    });
    render(<WaitingView />);

    fireEvent.click(screen.getByRole("button", { name: "lbt.waiting.cancel" }));

    expect(transport.ops().at(-1)).toBe("cancel");
  });

  test("after a long wait it says plainly it may take a while", () => {
    act(() => {
      store().setAdult(true);
      store().startWaiting("小橘");
    });
    render(<WaitingView />);

    act(() => void vi.advanceTimersByTime(45_000));

    expect(screen.getByText("lbt.waiting.longWait")).toBeInTheDocument();
  });

  test("a dropped connection is shown", () => {
    act(() => {
      store().setAdult(true);
      store().startWaiting("小橘");
    });
    render(<WaitingView />);

    emit({ type: "connection", state: "offline" });

    expect(screen.getByText("lbt.waiting.offline")).toBeInTheDocument();
  });
});

describe("ChatView", () => {
  test("a real partner is shown by their own nickname, not as simulated", () => {
    openChat(false);
    render(<ChatView />);

    expect([screen.getByText("阿樹") !== null, screen.queryByText("lbt.chat.partnerLabel")]).toEqual([
      true,
      null,
    ]);
  });

  test("the demo partner is labelled as simulated", () => {
    openChat(true);
    render(<ChatView />);

    expect(screen.getByText("lbt.chat.partnerLabel")).toBeInTheDocument();
  });

  test("partner markup is rendered as text, not elements", () => {
    openChat();
    render(<ChatView />);

    emit({ type: "message", id: "m1", from: "partner", text: '<img src=x onerror="alert(1)">' });

    expect(document.querySelector(".chat-messages img")).toBeNull();
  });

  test("submitting sends the draft and clears it", () => {
    openChat();
    render(<ChatView />);
    const input = screen.getByLabelText("lbt.chat.composerLabel") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "嗨" } });

    fireEvent.submit(input.closest("form") as HTMLFormElement);

    expect([transport.calls.at(-1), input.value]).toEqual([{ op: "send", arg: "嗨" }, ""]);
  });

  test("typing in the composer notifies the partner", () => {
    openChat();
    render(<ChatView />);

    fireEvent.change(screen.getByLabelText("lbt.chat.composerLabel"), { target: { value: "h" } });

    expect(transport.ops()).toContain("typing");
  });

  test("the partner's extend request shows a one-tap agree", () => {
    openChat();
    render(<ChatView />);
    emit({ type: "extendRequested", by: "partner" });

    fireEvent.click(screen.getByRole("button", { name: "lbt.chat.extendAgree" }));

    expect(transport.ops().at(-1)).toBe("extend");
  });

  test("my pending request disables the extend buttons", () => {
    openChat();
    render(<ChatView />);

    emit({ type: "extendRequested", by: "me" });

    expect(screen.getByRole("button", { name: "lbt.chat.extendAria" })).toBeDisabled();
  });

  test("when time is up the composer is disabled", () => {
    openChat(false, 2000);
    render(<ChatView />);

    act(() => void vi.advanceTimersByTime(2000));

    expect(screen.getByLabelText("lbt.chat.composerLabel")).toBeDisabled();
  });

  test("the crisis line is always in the aside", () => {
    openChat();
    render(<ChatView />);

    expect(screen.getByText("lbt.chat.aside.help")).toBeInTheDocument();
  });
});

describe("LbtApp", () => {
  test("walks home → waiting → chat → end → home", () => {
    detach();
    const app = new FakeTransport();
    render(<LbtApp createTransport={() => app} />);
    transport = app;

    fireEvent.click(screen.getByRole("checkbox", { name: /lbt\.home\.adult/ }));
    fireEvent.click(screen.getByRole("button", { name: /lbt\.home\.start/ }));
    const waiting = screen.getByRole("heading", { level: 1 }).textContent;
    emit(matched());
    const chat = screen.queryByLabelText("lbt.chat.mainAria") !== null;
    emit({ type: "ended", reason: "partner_left" });
    const reason = screen.getByText("lbt.end.reason.partner_left") !== null;
    fireEvent.click(screen.getByRole("button", { name: "lbt.end.home" }));

    expect({ waiting, chat, reason, view: store().view }).toEqual({
      waiting: "lbt.waiting.titleToplbt.waiting.titleBottom",
      chat: true,
      reason: true,
      view: "home",
    });
  });

  test("polls the transport for the head count", async () => {
    detach();
    const app = new FakeTransport();
    app.statusValue = { online: 7, waiting: 1, open: true, hours: "" };

    render(<LbtApp createTransport={() => app} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(store().town?.online).toBe(7);
  });

  test("the time-up dialog can say good night", () => {
    detach();
    const app = new FakeTransport();
    render(<LbtApp createTransport={() => app} />);
    transport = app;
    act(() => {
      store().setAdult(true);
      store().startWaiting("小橘");
    });
    emit(matched(1000));

    act(() => void vi.advanceTimersByTime(1000));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "lbt.modal.timeUp.leave" }));

    expect([store().view, app.ops().at(-1)]).toEqual(["end", "leave"]);
  });

  test("a report is sent and confirmed", async () => {
    detach();
    const app = new FakeTransport();
    render(<LbtApp createTransport={() => app} />);
    transport = app;
    act(() => {
      store().setAdult(true);
      store().startWaiting("小橘");
    });
    emit(matched());
    fireEvent.click(screen.getByRole("button", { name: "lbt.chat.report" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("radio", { name: "lbt.modal.report.reasons.spam" }));

    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "lbt.modal.report.submit" }));
    });

    expect([app.calls.at(-1), screen.getByText("lbt.modal.report.sentBody") !== null]).toEqual([
      { op: "report", arg: { reason: "spam", note: "" } },
      true,
    ]);
  });

  test("a failed report says so and keeps the form", async () => {
    detach();
    const app = new FakeTransport();
    app.reportResult = new Error("report_500");
    render(<LbtApp createTransport={() => app} />);
    transport = app;
    act(() => {
      store().setAdult(true);
      store().startWaiting("小橘");
    });
    emit(matched());
    fireEvent.click(screen.getByRole("button", { name: "lbt.chat.report" }));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "lbt.modal.report.submit" }));
    });

    expect(screen.getByText("lbt.notice.report_failed")).toBeInTheDocument();
  });

  test("unmounting stops the transport", () => {
    detach();
    const app = new FakeTransport();
    const { unmount } = render(<LbtApp createTransport={() => app} />);

    unmount();

    expect(app.stopped).toBe(true);
  });
});

test("the head count is refreshed as soon as our own connection opens", async () => {
  detach();
  const app = new FakeTransport();
  app.statusValue = { online: 0, waiting: 0, open: true, hours: "" };
  render(<LbtApp createTransport={() => app} />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  app.statusValue = { online: 1, waiting: 0, open: true, hours: "" };

  await act(async () => {
    app.emit({ type: "connection", state: "open" });
    await vi.advanceTimersByTimeAsync(0);
  });

  expect(store().town?.online).toBe(1);
});

describe("administrator companion invitation", () => {
  function waiting() {
    act(() => { store().setAdult(true); store().startWaiting("小橘"); });
    emit({type:"connection",state:"open"});
    emit({type:"companionInvite",id:"offer-1",expiresAt:Date.now()+60000});
  }
  test("requires a deliberate choice and does not match on receiving an offer", () => {
    waiting(); render(<WaitingView />);
    expect(store().view).toBe("waiting"); expect(transport.ops()).not.toContain("answerCompanion");
    fireEvent.click(screen.getByRole("button",{name:"lbt.companion.accept"}));
    expect(transport.calls.at(-1)).toEqual({op:"answerCompanion",arg:{id:"offer-1",accept:true}});
    expect(store().view).toBe("waiting");
    expect(screen.getByRole("button",{name:"lbt.companion.answering"})).toBeDisabled();
  });
  test("declining asks to keep waiting and clears only the matching offer", () => {
    waiting();render(<WaitingView />);
    fireEvent.click(screen.getByRole("button",{name:"lbt.companion.decline"}));
    expect(transport.calls.at(-1)).toEqual({op:"answerCompanion",arg:{id:"offer-1",accept:false}});
    emit({type:"companionCleared",id:"other-offer"}); expect(store().companionInvitation).not.toBeNull();
    emit({type:"companionCleared",id:"offer-1"}); expect(store().view).toBe("waiting");
    expect(screen.queryByText("lbt.companion.inviteTitle")).toBeNull();
  });
  test("expired invitations cannot be accepted", () => {
    waiting();render(<WaitingView />);act(()=>void vi.advanceTimersByTime(60000));
    expect(screen.queryByText("lbt.companion.inviteTitle")).toBeNull();
    act(()=>store().answerCompanion(true)); expect(transport.ops()).not.toContain("answerCompanion");
  });
  test("normal matching clears the invitation", () => {
    waiting();emit(matched()); expect(store().view).toBe("chat"); expect(store().companionInvitation).toBeNull();
  });
  test("companion uses the public nickname and neutral label", () => {
    openChat();const event=matched();if(event.type!=="matched") throw new Error();
    event.partner={nickname:"小辟穀",energy:2,preference:"story",role:"companion"};emit(event);render(<ChatView />);
    expect(screen.getByText("lbt.companion.label")).toBeInTheDocument();
    expect(screen.getByText("lbt.companion.chatDisclosure")).toBeInTheDocument();
    expect(screen.queryByText("lbt.chat.partnerLabel")).toBeNull();
  });
});
