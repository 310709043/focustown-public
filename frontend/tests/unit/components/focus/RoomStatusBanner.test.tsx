/**
 * RoomStatusBanner looks its copy up under `focus.room` as `banner.*`.
 * A namespace that already ends in `.banner` doubled the segment and every
 * state rendered a raw key, so check each key it asks for exists.
 */
import { render } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import en from "@/messages/en/focus.json";
import zhTW from "@/messages/zh-TW/focus.json";
import { useFocusRoomStore } from "@/lib/state/focusRoomStore";

const asked: string[] = [];

vi.mock("next-intl", () => ({
  useTranslations: (ns: string) => (key: string) => {
    asked.push(`${ns}.${key}`);
    return `${ns}.${key}`;
  },
}));

const { RoomStatusBanner } = await import("@/components/focus/RoomStatusBanner");

type Tree = { [key: string]: string | Tree };

function has(tree: Tree, path: string): boolean {
  const leaf = path
    .split(".")
    .reduce<string | Tree | undefined>(
      (node, part) => (node && typeof node !== "string" ? node[part] : undefined),
      tree,
    );
  return typeof leaf === "string";
}

const STATES = [
  { status: null, endedReason: null, remaining: null },
  { status: "both_joined", endedReason: null, remaining: null },
  { status: "active", endedReason: null, remaining: null },
  { status: "active", endedReason: null, remaining: 600 },
  { status: "ended", endedReason: "completed", remaining: null },
  { status: "ended", endedReason: "timeout", remaining: null },
  { status: "ended", endedReason: "both_left", remaining: null },
  { status: "ended", endedReason: "other", remaining: null },
] as const;

afterEach(() => {
  asked.length = 0;
});

describe("RoomStatusBanner copy", () => {
  test.each(STATES)("$status / $endedReason uses a key both locales define", (state) => {
    useFocusRoomStore.setState({
      status: state.status,
      endedReason: state.endedReason,
      timer: { ...useFocusRoomStore.getState().timer, remainingSeconds: state.remaining },
    } as Partial<ReturnType<typeof useFocusRoomStore.getState>>);

    render(<RoomStatusBanner />);

    const keys = asked.map((k) => k.replace(/^focus\./, ""));
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect([key, has(en as unknown as Tree, key), has(zhTW as unknown as Tree, key)]).toEqual([
        key,
        true,
        true,
      ]);
    }
  });
});
