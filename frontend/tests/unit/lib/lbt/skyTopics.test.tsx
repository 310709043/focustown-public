/**
 * Sky topics: the API payload is validated (never guessed), a failure falls
 * back to the town's own ideas, the carrier labels each word by its source,
 * and a tapped word becomes an opener in the chat.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { ChatView } from "@/components/lbt/ChatView";
import { SkyTopicLine, SkyTopics } from "@/components/lbt/SkyTopics";
import { useLbtStore } from "@/lib/lbt/sessionStore";
import {
  fetchSkyTopics, IDEA_QUESTIONS, IDEA_TOPICS, ideaTopicsFor, isQuestion, toSkyTopics, useSkyTopics,
} from "@/lib/lbt/skyTopics";

const ok = (body: unknown) => ({ ok: true, json: async () => body }) as Response;

describe("toSkyTopics / fetchSkyTopics", () => {
  test("keeps well-formed items and drops the rest", () => {
    expect(
      toSkyTopics({
        items: [
          { word: "颱風假", kind: "trend" },
          { word: " 宵夜 ", kind: "pick" },
          { word: "x", kind: "rumour" },
          { word: "颱風假你都怎麼過？", kind: "trend" },
          { word: "一".repeat(30), kind: "trend" },
          { word: 3, kind: "idea" },
          null,
        ],
      }),
    ).toEqual([
      { word: "颱風假", kind: "trend" },
      { word: "宵夜", kind: "pick" },
      { word: "颱風假你都怎麼過？", kind: "trend" },
    ]);
    expect(toSkyTopics({ items: "nope" })).toEqual([]);
  });

  test("a failing or empty endpoint falls back to the town's ideas", async () => {
    expect(await fetchSkyTopics("http://api", vi.fn(async () => { throw new Error("down"); }))).toBe(IDEA_TOPICS);
    expect(await fetchSkyTopics("http://api", vi.fn(async () => ({ ok: false }) as Response))).toBe(IDEA_TOPICS);
    expect(await fetchSkyTopics("http://api", vi.fn(async () => ok({ items: [] })))).toBe(IDEA_TOPICS);
    const fetcher = vi.fn(async () => ok({ items: [{ word: "颱風假", kind: "trend" }] }));
    expect(await fetchSkyTopics("http://api/", fetcher)).toEqual([{ word: "颱風假", kind: "trend" }]);
    expect(fetcher).toHaveBeenCalledWith("http://api/api/v1/lbt/topics");
  });
});

describe("the town's own questions", () => {
  test("match the edge's list, in the same order", () => {
    const edge = readFileSync(resolve(process.cwd(), "../edge/src/topics.ts"), "utf8");
    const block = edge.slice(edge.indexOf("export const IDEA_QUESTIONS = ["), edge.indexOf("] as const;", edge.indexOf("export const IDEA_QUESTIONS = [")));
    expect([...block.matchAll(/"([^"]+)"/g)].map((m) => m[1])).toEqual([...IDEA_QUESTIONS]);
  });

  test("are questions, start somewhere new each day, and none is lost", () => {
    expect(IDEA_QUESTIONS.every(isQuestion)).toBe(true);
    const a = ideaTopicsFor(new Date(2026, 9, 8));
    const b = ideaTopicsFor(new Date(2026, 9, 9));
    expect(a[0]).not.toEqual(b[0]);
    expect(new Set(a.map((t) => t.word)).size).toBe(IDEA_TOPICS.length);
  });
});

describe("SkyTopics", () => {
  beforeEach(() => {
    useSkyTopics.setState({ items: [{ word: "颱風假", kind: "trend" }, { word: "宵夜", kind: "pick" }], index: 0, loaded: true });
    useLbtStore.setState({ mode: "demo", skyTopic: null });
  });

  test("every carrier shows the word with an honest label", () => {
    render(<SkyTopics />);
    const carriers = screen.getAllByRole("button", { name: /lbt\.sky\.aria/ });
    expect(carriers).toHaveLength(4);
    expect(screen.getAllByText("颱風假")).toHaveLength(4);
    expect(screen.getAllByText("lbt.sky.kind.trend").length).toBeGreaterThan(0);
  });

  test("a question wraps onto two lines; a keyword stays on one", () => {
    useSkyTopics.setState({ items: [{ word: "颱風假你都怎麼過？", kind: "trend" }], index: 0, loaded: true });
    const { container, unmount } = render(<SkyTopics />);
    expect(container.querySelectorAll(".sky-carrier.is-long")).toHaveLength(4);
    unmount();
    useSkyTopics.setState({ items: [{ word: "颱風假", kind: "trend" }], index: 0, loaded: true });
    expect(render(<SkyTopics />).container.querySelectorAll(".sky-carrier.is-long")).toHaveLength(0);
  });

  test("a finished pass brings the next word", () => {
    render(<SkyTopics />);
    const carrier = screen.getAllByRole("button", { name: /lbt\.sky\.aria/ })[0] as HTMLElement;
    act(() => {
      // jsdom has no AnimationEvent, so React may listen for the prefixed name.
      fireEvent.animationIteration(carrier);
      if (screen.queryAllByText("宵夜").length === 0) carrier.dispatchEvent(new Event("webkitAnimationIteration", { bubbles: true }));
    });
    expect(screen.getAllByText("宵夜")).toHaveLength(4);
  });

  test("tapping keeps the word for the chat and says so", () => {
    render(<SkyTopicLine />);
    fireEvent.click(screen.getByRole("button", { name: /lbt\.sky\.aria/ }));
    expect(useLbtStore.getState().skyTopic).toBe("颱風假");
    expect(screen.getByRole("status")).toHaveTextContent("lbt.sky.taken");
  });
});

describe("ChatView with a sky topic", () => {
  test("offers it as an opener and puts it in the composer", () => {
    act(() => {
      useLbtStore.setState({
        view: "chat",
        mode: "demo",
        skyTopic: "颱風假",
        topicId: null,
        partner: { nickname: "阿樹", energy: 2, preference: "story" },
        endsAt: Date.now() + 420_000,
        lines: [],
      });
    });
    render(<ChatView />);
    expect(screen.getByText("lbt.chat.skyLabel")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "lbt.chat.topicUse" }));
    expect(screen.getByRole("textbox")).toHaveValue('lbt.chat.skyOpener({"word":"颱風假"})');
    expect(useLbtStore.getState().skyTopic).toBeNull();
  });
});

describe("ChatView with a sky question", () => {
  test("a question opens the chat as it is, not wrapped in the keyword frame", () => {
    act(() => {
      useLbtStore.setState({
        view: "chat",
        mode: "demo",
        skyTopic: "颱風假你都怎麼過？",
        topicId: null,
        partner: { nickname: "阿樹", energy: 2, preference: "story" },
        endsAt: Date.now() + 420_000,
        lines: [],
      });
    });
    render(<ChatView />);
    fireEvent.click(screen.getByRole("button", { name: "lbt.chat.topicUse" }));
    expect(screen.getByRole("textbox")).toHaveValue('lbt.chat.skyOpenerQuestion({"word":"颱風假你都怎麼過？"})');
  });
});
