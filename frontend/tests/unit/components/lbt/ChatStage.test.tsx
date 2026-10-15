/**
 * The chat stage's batteries: who talks, who reacts and when, the faces
 * they rest on, and the cables. Faces are read from `data-x`, which CSS
 * turns into the drawing; the drawing itself is not tested here.
 */
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { ChatStage } from "@/components/lbt/ChatStage";
import { CHEER_MS, FACE_MS, REACT_DELAY_MS } from "@/lib/lbt/chatFaces";
import { useLbtStore } from "@/lib/lbt/sessionStore";
import type { TransportEvent } from "@/lib/lbt/transport";

import { FakeTransport, matched } from "../../lib/lbt/fakeTransport";

const store = () => useLbtStore.getState();
let transport: FakeTransport;
let detach: () => void;

const emit = (event: TransportEvent) => act(() => transport.emit(event));
const wait = (ms: number) => act(() => void vi.advanceTimersByTime(ms));
const faces = () =>
  ["lr", "ll"].map((side) => document.querySelector(`.av.${side}`)?.getAttribute("data-x"));
const cables = () =>
  Array.from(document.querySelectorAll(".cable")).map((c) => c.getAttribute("data-on"));

function openChat(endsInMs = 420_000) {
  act(() => {
    transport.emit({ type: "connection", state: "open" });
    store().setAdult(true);
    store().startWaiting("小橘");
    transport.emit(matched(endsInMs));
  });
  render(<ChatStage />);
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false });
  vi.setSystemTime(new Date("2026-10-15T13:00:00Z"));
  store().reset();
  transport = new FakeTransport();
  detach = store().attach(transport);
});

afterEach(() => {
  detach();
  store().reset();
  vi.useRealTimers();
});

describe("ChatStage faces", () => {
  test("both rest on idle when the chat opens", () => {
    openChat();

    expect(faces()).toEqual(["idle", "idle"]);
  });

  test("the partner talks, and I react a beat later", () => {
    openChat();
    emit({ type: "message", id: "m1", from: "partner", text: "今天好累" });

    const now = faces();
    wait(REACT_DELAY_MS);

    expect([now, faces()]).toEqual([
      ["talk", "idle"],
      ["talk", "notice"],
    ]);
  });

  test("a laugh makes the reader laugh along", () => {
    openChat();
    emit({ type: "message", id: "m1", from: "me", text: "哈哈好好笑" });

    wait(REACT_DELAY_MS);

    expect(faces()).toEqual(["laugh", "talk"]);
  });

  test("a reply to what the reader said makes them happy", () => {
    openChat();
    emit({ type: "message", id: "m1", from: "me", text: "你呢？" });
    wait(FACE_MS.laugh);
    emit({ type: "message", id: "m2", from: "partner", text: "我也是" });

    wait(REACT_DELAY_MS);

    expect(faces()).toEqual(["talk", "happy"]);
  });

  test("faces settle back to rest after their moment", () => {
    openChat();
    emit({ type: "message", id: "m1", from: "partner", text: "嗨" });

    wait(REACT_DELAY_MS + FACE_MS.notice);

    expect(faces()).toEqual(["idle", "idle"]);
  });

  test("typing makes the partner think", () => {
    openChat();

    emit({ type: "typing" });

    expect([faces()[0], document.querySelector(".stage-typing") !== null]).toEqual(["thinking", true]);
  });

  test("my plug: my cable goes in, the partner looks up, then I wait hopefully", () => {
    openChat();
    emit({ type: "extendRequested", by: "me" });

    const now = [faces(), cables()];
    wait(FACE_MS.notice);

    expect([now, faces()]).toEqual([
      [
        ["notice", "hopeful"],
        ["false", "true"],
      ],
      ["idle", "hopeful"],
    ]);
  });

  test("both plugged: both cheer, the badge shows, then it all settles", () => {
    openChat();
    emit({ type: "extendRequested", by: "me" });
    emit({ type: "extended", endsAt: Date.now() + 840_000 });

    const now = [faces(), cables(), document.querySelector(".stage-badge") !== null];
    wait(CHEER_MS);

    expect([now, [faces(), cables(), document.querySelector(".stage-badge") !== null]]).toEqual([
      [["cheer", "cheer"], ["true", "true"], true],
      [["idle", "idle"], ["false", "false"], false],
    ]);
  });

  test("in the last minute both look wistful and the ring warms", () => {
    openChat(50_000);

    expect([faces(), document.querySelector(".bs-ring.is-urgent") !== null]).toEqual([
      ["wistful", "wistful"],
      true,
    ]);
  });

  test("lines already there when the stage mounts cause no reaction", () => {
    act(() => {
      transport.emit({ type: "connection", state: "open" });
      store().setAdult(true);
      store().startWaiting("小橘");
      transport.emit(matched());
      transport.emit({ type: "message", id: "m1", from: "partner", text: "哈哈" });
    });
    render(<ChatStage />);

    wait(REACT_DELAY_MS);

    expect(faces()).toEqual(["idle", "idle"]);
  });
});

describe("ChatStage avatars", () => {
  test("uses the server's pair and never the same avatar twice without one", () => {
    act(() => {
      transport.emit({ type: "connection", state: "open" });
      store().setAdult(true);
      store().startWaiting("小橘");
      const event = matched();
      if (event.type !== "matched") throw new Error("expected matched");
      transport.emit({ ...event, me: { ...event.me, avatar: "headphones" } });
    });
    render(<ChatStage />);

    const pair = ["lr", "ll"].map((side) =>
      document.querySelector(`.av.${side}`)?.getAttribute("data-avatar"),
    );

    expect([pair[1], pair[0] !== pair[1]]).toEqual(["headphones", true]);
  });
});
