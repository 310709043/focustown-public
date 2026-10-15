/**
 * Face rules for the chat stage: reactions to a message and the resting
 * face. Faces answer the conversation, never the battery level.
 */
import { describe, expect, test } from "vitest";

import { sceneArt } from "@/lib/lbt/avatarArt";
import { AVATAR_IDS, stageAvatars } from "@/lib/lbt/avatars";
import { reactionFace, restingFace, type FaceContext } from "@/lib/lbt/chatFaces";

const calm: FaceContext = { extendMine: false, extendPartner: false, lastMinute: false, partnerTyping: false };

describe("reactionFace", () => {
  test.each([
    ["哈哈哈", false, "laugh"],
    ["笑死", true, "laugh"],
    ["LOL", false, "laugh"],
    ["我也是", true, "happy"],
    ["今天好累", false, "notice"],
    [undefined, true, "happy"],
  ] as const)("%s (reply to reader: %s) → %s", (text, reply, face) => {
    expect(reactionFace(text, reply)).toBe(face);
  });
});

describe("restingFace", () => {
  test("idle when nothing is happening", () => {
    expect([restingFace("self", calm), restingFace("partner", calm)]).toEqual(["idle", "idle"]);
  });

  test("the side that plugged in alone waits hopefully, even in the last minute", () => {
    const context = { ...calm, extendMine: true, lastMinute: true };
    expect([restingFace("self", context), restingFace("partner", context)]).toEqual(["hopeful", "wistful"]);
  });

  test("only the partner thinks while they type", () => {
    const context = { ...calm, partnerTyping: true };
    expect([restingFace("self", context), restingFace("partner", context)]).toEqual(["idle", "thinking"]);
  });
});

describe("stageAvatars", () => {
  test("keeps the server's pair", () => {
    expect(stageAvatars("coffee", "plug")).toEqual(["coffee", "plug"]);
  });

  test("fills a missing side with one that differs from the other", () => {
    const filled = AVATAR_IDS.flatMap((id) => [stageAvatars(id, null), stageAvatars(null, id)]);
    expect(filled.every(([them, me]) => them !== me)).toBe(true);
  });
});

describe("sceneArt", () => {
  test("every avatar has a body, an accessory, a face offset and a lid colour", () => {
    const art = AVATAR_IDS.map((id) => sceneArt(id, ":r1:"));
    expect(
      art.every(
        (a) =>
          a.body.includes("<rect") &&
          a.accessory.length > 0 &&
          Math.abs(a.faceDy) <= 2 &&
          /^#[0-9a-f]{6}$/.test(a.lid),
      ),
    ).toBe(true);
  });

  test("gradient ids are per instance and safe in url(#…)", () => {
    const [a, b] = [sceneArt("coffee", ":r1:"), sceneArt("coffee", ":r2:")];
    expect([a.body.includes('id="coffee-r1-fill"'), b.body.includes('id="coffee-r2-fill"')]).toEqual([true, true]);
  });
});
