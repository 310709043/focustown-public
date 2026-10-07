/**
 * Sky topics: the API payload is validated (never guessed), a failure falls
 * back to the town's own ideas, the carrier labels each word by its source,
 * and a tapped word becomes an opener in the chat.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { ChatView } from "@/components/lbt/ChatView";
import { SkyTopicLine, SkyTopics } from "@/components/lbt/SkyTopics";
import { useLbtStore } from "@/lib/lbt/sessionStore";
import { fetchSkyTopics, IDEA_TOPICS, toSkyTopics, useSkyTopics } from "@/lib/lbt/skyTopics";

const ok = (body: unknown) => ({ ok: true, json: async () => body }) as Response;

describe("toSkyTopics / fetchSkyTopics", () => {
  test("keeps well-formed items and drops the rest", () => {
    expect(
      toSkyTopics({
        items: [
          { word: "颱風假", kind: "trend" },
          { word: " 宵夜 ", kind: "pick" },
          { word: "x", kind: "rumour" },
          { word: "一".repeat(20), kind: "trend" },
          { word: 3, kind: "idea" },
          null,
        ],
      }),
    ).toEqual([
      { word: "颱風假", kind: "trend" },
      { word: "宵夜", kind: "pick" },
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
