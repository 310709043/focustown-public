import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { JojoInvitation } from "@/components/lbt/JojoInvitation";
import { ChatStage } from "@/components/lbt/ChatStage";
import { useLbtStore } from "@/lib/lbt/sessionStore";
import { mapServerFrame } from "@/lib/lbt/liveTransport";
import { FakeTransport, matched } from "../../lib/lbt/fakeTransport";

const store = () => useLbtStore.getState();
vi.mock("next-intl", async () => {
  const messages = (await import("@/messages/zh-TW/lbt.json")).default;
  return {
    useTranslations: (ns = "") => (key: string) => {
      const path = (ns + "." + key).replace(/^lbt\./, "");
      const value = path.split(".").reduce((v: unknown, k) => v && typeof v === "object" ? (v as Record<string, unknown>)[k] : undefined, messages);
      return typeof value === "string" ? value : key;
    },
    useLocale: () => "zh-TW",
  };
});
let transport: FakeTransport & { startJojo: ReturnType<typeof vi.fn<() => void>> };
let detach: () => void;
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-05T13:00:00Z")); store().reset();
  transport = Object.assign(new FakeTransport(), { startJojo: vi.fn<() => void>() });
  detach = store().attach(transport);
  transport.emit({ type: "connection", state: "open" });
  store().setAdult(true); store().startWaiting("訪客");
});
afterEach(() => { act(() => { detach(); store().reset(); }); vi.useRealTimers(); });

test("server clock skew is translated and invitation waits the full three minutes", () => {
  const event = mapServerFrame({ type: "lbt.waiting", server_now: "2026-11-06T13:00:00Z", jojo_available_at: "2026-11-06T13:03:00Z" }, Date.now());
  expect(event).toEqual({ type: "waiting", jojoAvailableAt: Date.now() + 180000 });
  act(() => transport.emit(event!)); render(<JojoInvitation />);
  expect(screen.queryByRole("button", { name: /AI/ })).toBeNull();
  act(() => vi.advanceTimersByTime(179999)); expect(transport.startJojo).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(1));
  expect(screen.getByRole("button", { name: /我知道是 AI/ })).toBeEnabled();
  expect(transport.startJojo).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: /我知道是 AI/ }));
  expect(transport.startJojo).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "正在接通…" })).toBeDisabled();
});

test("declining leaves the visitor in the human queue without any AI request", () => {
  transport.emit({ type: "waiting", jojoAvailableAt: Date.now() }); render(<JojoInvitation />);
  act(() => vi.advanceTimersByTime(1));
  fireEvent.click(screen.getByRole("button", { name: "繼續等真人" }));
  expect(store().view).toBe("waiting"); expect(transport.startJojo).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: /我知道是 AI/ })).toBeNull();
});

test("AI role survives mapping and is visibly disclosed in the chat stage", () => {
  const frame = { type: "lbt.matched", me: { nickname: "訪客", energy: 2, preference: "casual" },
    partner: { nickname: "你家貓咪會後空翻嗎", energy: 3, preference: "casual", role: "ai" },
    ends_at: new Date(Date.now() + 420000).toISOString(), server_now: new Date().toISOString() };
  const event = mapServerFrame(frame, Date.now());
  act(() => transport.emit(event!)); render(<ChatStage />);
  expect(screen.getByText("你家貓咪會後空翻嗎")).toBeVisible();
  expect(screen.getByText("AI 居民・成年女性角色")).toBeVisible();
  expect(screen.getByText(/「你家貓咪會後空翻嗎」是 AI 虛構角色/)).toBeVisible();
});

test("one AI message is pending at a time and an error unlocks the composer", () => {
  const event = matched();
  if (event.type !== "matched") throw new Error("invalid test fixture");
  event.partner = { ...event.partner, nickname: "你家貓咪會後空翻嗎", role: "ai" };
  transport.emit(event);
  expect(store().sendMessage("嗨")).toBe(true);
  expect(store().sendMessage("第二句先留在輸入框")).toBe(false);
  transport.emit({ type: "error", code: "jojo_unavailable" });
  expect(store().sendMessage("再試一次")).toBe(true);
  transport.emit({ type: "message", id: "reply", from: "partner", text: "嗨 😏" });
  expect(store().jojoReplyPending).toBe(false);
  store().leave(); expect(store().lines).toEqual([]); expect(store().partner).toBeNull();
});
