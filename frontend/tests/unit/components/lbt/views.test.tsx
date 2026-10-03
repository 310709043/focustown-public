/**
 * LowBatteryTown views driven through the real store (fake timers).
 * Worth testing: radio semantics, nickname handling at start, the transcript
 * renders visitor text as text, time-up disables the composer, topic cards,
 * and the end-to-end walk home → waiting → chat → end → home.
 * NOT worth testing: CSS, animations, localised copy (keys are asserted).
 */
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { ChatView } from "@/components/lbt/ChatView";
import { HomeView } from "@/components/lbt/HomeView";
import { LbtApp } from "@/components/lbt/LbtApp";
import {
  EXTEND_ACCEPT_DELAY_MS,
  OPENER_DELAY_MS,
  SESSION_SECONDS,
  WAIT_MS,
} from "@/lib/lbt/constants";
import { useLbtStore } from "@/lib/lbt/sessionStore";

vi.mock("@/i18n/routing", () => ({
  Link: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a>,
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/",
  routing: { locales: ["zh-TW", "en"] },
}));

const store = () => useLbtStore.getState();
const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

beforeEach(() => {
  vi.useFakeTimers();
  store().reset();
});

afterEach(() => {
  store().reset();
  vi.useRealTimers();
});

describe("HomeView", () => {
  test("starts on the lowest battery with one tab stop in the group", () => {
    render(<HomeView />);
    const radios = screen.getAllByRole("radio", { name: /lbt\.energy\./ });

    expect(radios.map((r) => [r.getAttribute("aria-checked"), r.tabIndex])).toEqual([
      ["true", 0],
      ["false", -1],
      ["false", -1],
    ]);
  });

  test("choosing a battery updates the store and the checked radio", () => {
    render(<HomeView />);

    fireEvent.click(screen.getByRole("radio", { name: /energy\.high\.name/ }));

    expect({
      energy: store().energy,
      checked: screen.getByRole("radio", { name: /energy\.high\.name/ }).getAttribute("aria-checked"),
    }).toEqual({ energy: 3, checked: "true" });
  });

  test("ArrowRight moves the selection to the next battery", () => {
    render(<HomeView />);
    const first = screen.getByRole("radio", { name: /energy\.low\.name/ });
    first.focus();

    fireEvent.keyDown(first.parentElement as HTMLElement, { key: "ArrowRight" });

    expect(store().energy).toBe(2);
  });

  test("ArrowLeft from the first battery wraps to the last", () => {
    render(<HomeView />);
    const first = screen.getByRole("radio", { name: /energy\.low\.name/ });
    first.focus();

    fireEvent.keyDown(first.parentElement as HTMLElement, { key: "ArrowLeft" });

    expect(store().energy).toBe(3);
  });

  test("choosing a chat preference updates the store", () => {
    render(<HomeView />);

    fireEvent.click(screen.getByRole("radio", { name: "lbt.preference.listen" }));

    expect(store().preference).toBe("listen");
  });

  test("walking in with the prefilled nickname commits it and starts waiting", () => {
    render(<HomeView />);

    fireEvent.click(screen.getByRole("button", { name: /lbt\.home\.start/ }));

    expect({ view: store().view, nickname: store().nickname }).toEqual({
      view: "waiting",
      nickname: "lbt.home.nickname.default",
    });
  });

  test("a blank nickname falls back to the default", () => {
    render(<HomeView />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "   " } });

    fireEvent.click(screen.getByRole("button", { name: /lbt\.home\.start/ }));

    expect(store().nickname).toBe("lbt.home.nickname.default");
  });

  test("a nickname longer than the limit is cut when committed", () => {
    render(<HomeView />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "月".repeat(20) } });

    fireEvent.click(screen.getByRole("button", { name: /lbt\.home\.start/ }));

    expect(store().nickname).toBe("月".repeat(12));
  });

  test("the nickname input is capped at 12 characters in the field itself", () => {
    render(<HomeView />);

    expect(screen.getByRole("textbox")).toHaveAttribute("maxlength", "12");
  });

  test("the support link opens the support dialog", () => {
    render(<HomeView />);

    fireEvent.click(screen.getByRole("button", { name: /lbt\.home\.side\.support/ }));

    expect(store().modal).toEqual({ type: "support" });
  });
});

function openChat() {
  act(() => {
    store().startWaiting("小橘");
    vi.advanceTimersByTime(WAIT_MS + OPENER_DELAY_MS);
  });
}

describe("ChatView", () => {
  test("shows the full window on the clock", () => {
    openChat();
    render(<ChatView />);

    expect(screen.getByLabelText("lbt.chat.timerAria")).toHaveTextContent("07:00");
  });

  test("labels the partner as simulated", () => {
    openChat();
    render(<ChatView />);

    expect(screen.getByText("lbt.chat.partnerLabel")).toBeInTheDocument();
  });

  test("renders visitor markup as plain text, not elements", () => {
    openChat();
    render(<ChatView />);

    act(() => void store().sendMessage('<img src=x onerror="alert(1)">'));

    expect(document.querySelector(".chat-messages img")).toBeNull();
  });

  test("the visitor's own message appears as a bubble", () => {
    openChat();
    render(<ChatView />);

    act(() => void store().sendMessage("今天有點累"));

    expect(screen.getByText("今天有點累")).toHaveClass("bubble");
  });

  test("submitting the composer sends and clears the draft", () => {
    openChat();
    render(<ChatView />);
    const input = screen.getByLabelText("lbt.chat.composerLabel");
    fireEvent.change(input, { target: { value: "嗨" } });

    fireEvent.submit(input.closest("form") as HTMLFormElement);

    expect({ sent: screen.getByText("嗨").className, draft: (input as HTMLInputElement).value }).toEqual({
      sent: "bubble",
      draft: "",
    });
  });

  test("a blank draft is not sent and is kept as typed", () => {
    openChat();
    render(<ChatView />);
    const input = screen.getByLabelText("lbt.chat.composerLabel");
    fireEvent.change(input, { target: { value: "   " } });

    fireEvent.submit(input.closest("form") as HTMLFormElement);

    expect((input as HTMLInputElement).value).toBe("   ");
  });

  test("focus lands in the composer on arrival", () => {
    openChat();
    render(<ChatView />);

    expect(screen.getByLabelText("lbt.chat.composerLabel")).toHaveFocus();
  });

  test("the typing indicator shows while the partner is composing", () => {
    act(() => {
      store().startWaiting("小橘");
      vi.advanceTimersByTime(WAIT_MS);
    });
    render(<ChatView />);

    expect(screen.getByRole("status", { name: "lbt.chat.typing" })).toBeInTheDocument();
  });

  test("drawing a topic shows its card", () => {
    openChat();
    render(<ChatView />);

    fireEvent.click(screen.getByRole("button", { name: /lbt\.chat\.promptDraw/ }));

    expect(screen.getByText("lbt.topics.moment")).toBeInTheDocument();
  });

  test("using a topic copies it into the composer and hides the card", () => {
    openChat();
    render(<ChatView />);
    fireEvent.click(screen.getByRole("button", { name: /lbt\.chat\.promptDraw/ }));

    fireEvent.click(screen.getByRole("button", { name: "lbt.chat.topicUse" }));

    expect({
      value: (screen.getByLabelText("lbt.chat.composerLabel") as HTMLInputElement).value,
      card: document.querySelector(".topic-card"),
    }).toEqual({ value: "lbt.topics.moment", card: null });
  });

  test("another topic replaces the card text", () => {
    openChat();
    render(<ChatView />);
    fireEvent.click(screen.getByRole("button", { name: /lbt\.chat\.promptDraw/ }));

    fireEvent.click(screen.getByRole("button", { name: /lbt\.chat\.topicNext/ }));

    expect(screen.getByText("lbt.topics.pause")).toBeInTheDocument();
  });

  test("the extend buttons are disabled while a request is pending", () => {
    openChat();
    render(<ChatView />);

    fireEvent.click(screen.getByRole("button", { name: "lbt.chat.extendAria" }));

    expect(screen.getByRole("button", { name: "lbt.chat.extendAria" })).toBeDisabled();
  });

  test("an agreed extension re-enables the buttons and adds time", () => {
    openChat();
    render(<ChatView />);
    fireEvent.click(screen.getByRole("button", { name: "lbt.chat.extendAria" }));

    advance(EXTEND_ACCEPT_DELAY_MS);

    expect(screen.getByLabelText("lbt.chat.timerAria")).toHaveTextContent("13:58");
  });

  test("when time is up the composer and send button are disabled", () => {
    openChat();
    render(<ChatView />);

    advance(SESSION_SECONDS * 1000);

    expect([
      screen.getByLabelText("lbt.chat.composerLabel"),
      screen.getByRole("button", { name: "lbt.chat.send" }),
    ].map((el) => (el as HTMLInputElement | HTMLButtonElement).disabled)).toEqual([true, true]);
  });

  test("the report link opens the report dialog", () => {
    openChat();
    render(<ChatView />);

    fireEvent.click(screen.getByRole("button", { name: "lbt.chat.report" }));

    expect(store().modal).toEqual({ type: "report" });
  });
});

describe("LbtApp", () => {
  test("walks home → waiting → chat → end → home", () => {
    render(<LbtApp />);

    fireEvent.click(screen.getByRole("button", { name: /lbt\.home\.start/ }));
    const waiting = screen.getByRole("heading", { level: 1 }).textContent;
    advance(WAIT_MS);
    const chat = screen.getByLabelText("lbt.chat.mainAria") !== null;
    fireEvent.click(screen.getByRole("button", { name: /lbt\.chat\.leave/ }));
    const end = screen.getByRole("heading", { level: 1 }).textContent;
    fireEvent.click(screen.getByRole("button", { name: "lbt.end.home" }));

    expect({
      waiting,
      chat,
      end,
      home: store().view,
    }).toEqual({
      waiting: "lbt.waiting.titleToplbt.waiting.titleBottom",
      chat: true,
      end: "lbt.end.titleToplbt.end.titleBottom",
      home: "home",
    });
  });

  test("cancelling the wait returns home and never opens a chat", () => {
    render(<LbtApp />);
    fireEvent.click(screen.getByRole("button", { name: /lbt\.home\.start/ }));

    fireEvent.click(screen.getByRole("button", { name: "lbt.waiting.cancel" }));
    advance(WAIT_MS * 2);

    expect(store().view).toBe("home");
  });

  test("the time-up dialog offers extending and says good night on request", () => {
    render(<LbtApp />);
    fireEvent.click(screen.getByRole("button", { name: /lbt\.home\.start/ }));
    advance(WAIT_MS);

    advance(SESSION_SECONDS * 1000);
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "lbt.modal.timeUp.leave" }));

    expect(store().view).toBe("end");
  });

  test("unmounting stops the session so no timers fire afterwards", () => {
    const { unmount } = render(<LbtApp />);
    fireEvent.click(screen.getByRole("button", { name: /lbt\.home\.start/ }));
    unmount();

    advance(WAIT_MS * 2);

    expect(store().view).toBe("home");
  });

  test("the header guide button opens the about dialog", () => {
    render(<LbtApp />);

    fireEvent.click(screen.getAllByRole("button", { name: /lbt\.topbar\.guide/ })[0]);

    expect(store().modal).toEqual({ type: "about" });
  });

  test("the brand link returns home from the chat", () => {
    render(<LbtApp />);
    fireEvent.click(screen.getByRole("button", { name: /lbt\.home\.start/ }));
    advance(WAIT_MS);

    fireEvent.click(screen.getByRole("link", { name: "lbt.brand.homeAria" }));

    expect(store().view).toBe("home");
  });
});
