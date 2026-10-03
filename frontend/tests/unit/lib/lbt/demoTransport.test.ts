/**
 * Demo transport — the labelled script behind the public prototype.
 * Worth testing: the partner is always marked simulated, pacing, reply
 * cycling, extension, cancel/leave stop every pending timer, and the
 * head count only comes from a real source.
 */
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import {
  EXTEND_ACCEPT_DELAY_MS,
  OPENER_DELAY_MS,
  REPLY_DELAY_MS,
  REPLY_IDS,
  SESSION_SECONDS,
  WAIT_MS,
} from "@/lib/lbt/constants";
import { createDemoTransport } from "@/lib/lbt/demoTransport";
import type { TransportEvent } from "@/lib/lbt/transport";

const JOIN = { nickname: "小橘", energy: 1, preference: "listen", adult: true } as const;

let events: TransportEvent[];
let stop: () => void;
let transport: ReturnType<typeof createDemoTransport>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-03T13:00:00Z"));
  events = [];
  transport = createDemoTransport();
  stop = transport.start((e) => events.push(e));
});

afterEach(() => {
  stop();
  vi.useRealTimers();
});

const types = () => events.map((e) => e.type);

test("starts connected", () => {
  expect(events).toEqual([{ type: "connection", state: "open" }]);
});

test("refuses to start without the age confirmation", () => {
  transport.join({ ...JOIN, adult: false });

  expect(events.at(-1)).toEqual({ type: "error", code: "age_required" });
});

test("waits before matching", () => {
  transport.join(JOIN);

  vi.advanceTimersByTime(WAIT_MS - 1);

  expect(types()).toEqual(["connection", "waiting"]);
});

test("the match is always marked simulated", () => {
  transport.join(JOIN);

  vi.advanceTimersByTime(WAIT_MS);

  expect(events.find((e) => e.type === "matched")).toMatchObject({
    simulated: true,
    endsAt: Date.now() + SESSION_SECONDS * 1000,
  });
});

test("the scripted partner leans the other way on listening vs telling", () => {
  transport.join(JOIN);
  vi.advanceTimersByTime(WAIT_MS);

  const match = events.find((e) => e.type === "matched");

  expect(match && match.type === "matched" ? match.partner.preference : null).toBe("story");
});

test("the opener arrives after its delay", () => {
  transport.join(JOIN);
  vi.advanceTimersByTime(WAIT_MS + OPENER_DELAY_MS);

  expect(events.at(-1)).toMatchObject({ type: "message", from: "partner", ref: { type: "opener" } });
});

test("my message is echoed, then answered from the script in order", () => {
  transport.join(JOIN);
  vi.advanceTimersByTime(WAIT_MS + OPENER_DELAY_MS);

  transport.send("hi");
  vi.advanceTimersByTime(REPLY_DELAY_MS);
  transport.send("again");
  vi.advanceTimersByTime(REPLY_DELAY_MS);

  const replies = events.flatMap((e) =>
    e.type === "message" && e.ref?.type === "reply" ? [e.ref.id] : [],
  );
  expect(replies).toEqual(REPLY_IDS.slice(0, 2));
});

test("two quick messages get one reply", () => {
  transport.join(JOIN);
  vi.advanceTimersByTime(WAIT_MS + OPENER_DELAY_MS);

  transport.send("one");
  vi.advanceTimersByTime(REPLY_DELAY_MS - 100);
  transport.send("two");
  vi.advanceTimersByTime(REPLY_DELAY_MS);

  expect(events.filter((e) => e.type === "message" && e.ref?.type === "reply")).toHaveLength(1);
});

test("messages before the match are ignored", () => {
  transport.send("too early");

  expect(types()).not.toContain("message");
});

test("extending is confirmed after the scripted delay and adds a window", () => {
  transport.join(JOIN);
  vi.advanceTimersByTime(WAIT_MS);
  const before = (events.find((e) => e.type === "matched") as { endsAt: number }).endsAt;

  transport.extend();
  vi.advanceTimersByTime(EXTEND_ACCEPT_DELAY_MS);

  expect(events.at(-1)).toEqual({ type: "extended", endsAt: before + SESSION_SECONDS * 1000 });
});

test("cancelling the wait stops the match from happening", () => {
  transport.join(JOIN);
  transport.cancel();

  vi.advanceTimersByTime(WAIT_MS * 2);

  expect(types()).not.toContain("matched");
});

test("leaving ends the chat and stops pending replies", () => {
  transport.join(JOIN);
  vi.advanceTimersByTime(WAIT_MS + OPENER_DELAY_MS);
  transport.send("hi");

  transport.leave();
  vi.advanceTimersByTime(REPLY_DELAY_MS * 2);

  expect(types().slice(-1)).toEqual(["ended"]);
});

test("a report is never sent anywhere", async () => {
  await expect(transport.report("spam", "")).resolves.toBe("simulated");
});

test("without a real source there is no head count", async () => {
  await expect(transport.status()).resolves.toBeNull();
});

test("a real source supplies the head count", async () => {
  const counted = createDemoTransport({
    statusSource: () => ({ online: 4, waiting: 0, open: true, hours: "" }),
  });

  await expect(counted.status()).resolves.toEqual({ online: 4, waiting: 0, open: true, hours: "" });
});
