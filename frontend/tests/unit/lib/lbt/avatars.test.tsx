/**
 * Battery-family avatars: the pair rule (shared with edge and FastAPI), the
 * frame parsing, and that every avatar renders static artwork with ids
 * unique to each instance.
 */
import { render } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { BatteryAvatar } from "@/components/lbt/BatteryAvatar";
import { avatarSvg } from "@/lib/lbt/avatarArt";
import { AVATAR_IDS, avatarPair, isAvatarId } from "@/lib/lbt/avatars";
import { mapServerFrame } from "@/lib/lbt/liveTransport";

describe("avatarPair", () => {
  test("two different avatars, the same pair every time", () => {
    for (let i = 0; i < 500; i += 1) {
      const [a, b] = avatarPair(`c_${i}`);
      expect(a).not.toBe(b);
      expect(avatarPair(`c_${i}`)).toEqual([a, b]);
    }
  });

  test("matches the edge and FastAPI copies (fixed vectors)", () => {
    expect(avatarPair("c_1")).toEqual(["flower", "headphones"]);
    expect(avatarPair("8f6f3c1e-0a6b-4a52-9d55-3b2e1f0c9a77")).toEqual(["blanket", "scarf"]);
  });

  test("every avatar is reachable", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i += 1) avatarPair(`c_${i}`).forEach((a) => seen.add(a));
    expect([...seen].sort()).toEqual([...AVATAR_IDS].sort());
  });
});

describe("matched frame avatars", () => {
  const base = {
    type: "lbt.matched",
    ends_at: "2026-10-07T12:07:00Z",
    server_now: "2026-10-07T12:00:00Z",
  };
  const profile = { nickname: "阿樹", energy: 2, preference: "story" };

  test("known avatars are kept", () => {
    const event = mapServerFrame(
      { ...base, me: { ...profile, avatar: "coffee" }, partner: { ...profile, avatar: "plug" } },
      0,
    );
    expect(event).toMatchObject({ me: { avatar: "coffee" }, partner: { avatar: "plug" } });
  });

  test("unknown or missing avatars are dropped, never guessed", () => {
    const event = mapServerFrame(
      { ...base, me: { ...profile, avatar: "<img>" }, partner: profile },
      0,
    );
    expect(event && "me" in event ? [event.me.avatar, event.partner.avatar] : null).toEqual([
      undefined,
      undefined,
    ]);
    expect(isAvatarId("coffee")).toBe(true);
  });
});

describe("BatteryAvatar", () => {
  test.each(AVATAR_IDS)("%s renders an svg", (id) => {
    const { container } = render(<BatteryAvatar avatar={id} />);
    expect(container.querySelector(`span[data-avatar="${id}"] svg`)).not.toBeNull();
  });

  test("gradient ids differ between two instances of the same avatar", () => {
    const one = avatarSvg("coffee", ":r1:");
    const two = avatarSvg("coffee", ":r2:");
    const ids = (svg: string) => [...svg.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids(one).some((id) => ids(two).includes(id))).toBe(false);
  });
});
