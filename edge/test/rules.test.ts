/** Pure rules, ported from backend/tests/unit/test_lbt_rules.py. */
import { describe, expect, test } from "vitest";

import {
  CONTACT_MASK as M,
  InputError,
  NICKNAME_MAX,
  cleanText,
  compatibility,
  isOpen,
  maskContacts,
  parseOpenHours,
  parseProfile,
  pickPartner,
  type Preference,
  type Waiting,
} from "../src/rules";

const T0 = Date.UTC(2026, 9, 3, 13, 0);
const RELAX = 30_000;
const waiting = (id: string, preference: Preference = "casual", energy = 2, waited = 0): Waiting => ({
  guestId: id,
  profile: { nickname: id, energy, preference },
  joinedAt: T0 - waited * 1000,
});

describe("cleanText", () => {
  test.each([
    ["  hi  ", "hi"],
    ["a\u0000b", "ab"],
    ["a‮b", "ab"], // bidi override (spoofing)
    ["a​b", "ab"], // zero-width space
    ["line1\r\nline2", "line1\nline2"],
    ["", ""],
    ["   ", ""],
    [null, ""],
    [42, ""],
  ])("%j → %j", (raw, expected) => expect(cleanText(raw, 100)).toBe(expected));

  test("caps by code points, not UTF-16 units", () => expect(cleanText("🌙".repeat(5), 3)).toBe("🌙🌙🌙"));
});

describe("parseProfile", () => {
  test("accepts a valid profile", () =>
    expect(parseProfile({ nickname: " 小橘 ", energy: 1, preference: "listen" })).toEqual({
      nickname: "小橘",
      energy: 1,
      preference: "listen",
    }));

  test("caps the nickname", () =>
    expect(parseProfile({ nickname: "月".repeat(30), energy: 2, preference: "casual" }).nickname).toBe(
      "月".repeat(NICKNAME_MAX),
    ));

  test("flattens newlines in the nickname", () =>
    expect(parseProfile({ nickname: "a\nb", energy: 2, preference: "casual" }).nickname).toBe("a b"));

  test.each([
    [{ nickname: "  ", energy: 1, preference: "casual" }, "nickname_required"],
    [{ nickname: "x", energy: 4, preference: "casual" }, "invalid_energy"],
    [{ nickname: "x", energy: "1", preference: "casual" }, "invalid_energy"],
    [{ nickname: "x", energy: true, preference: "casual" }, "invalid_energy"],
    [{ nickname: "x", energy: 1, preference: "rant" }, "invalid_preference"],
    [null, "nickname_required"],
  ])("rejects %j with %s", (raw, code) => {
    expect(() => parseProfile(raw)).toThrow(InputError);
    try {
      parseProfile(raw);
    } catch (e) {
      expect((e as InputError).code).toBe(code);
    }
  });
});

describe("compatibility", () => {
  const p = (preference: Preference, energy = 2) => ({ nickname: "x", energy, preference });
  test.each([
    ["listen", "story", 4],
    ["casual", "listen", 2],
    ["story", "story", 2],
    ["listen", "listen", 1],
  ] as const)("%s + %s = %i (close batteries)", (a, b, score) => expect(compatibility(p(a), p(b))).toBe(score));

  test("batteries two apart lose the pace point", () => expect(compatibility(p("listen", 1), p("story", 3))).toBe(3));
  test("is symmetric", () => expect(compatibility(p("casual", 1), p("story", 3))).toBe(compatibility(p("story", 3), p("casual", 1))));
});

describe("pickPartner", () => {
  test("prefers the best score", () => {
    const best = waiting("story", "story", 1);
    expect(pickPartner(waiting("me", "listen", 1), [waiting("c", "casual", 1), best], T0, RELAX)).toBe(best);
  });
  test("breaks ties by longest wait", () => {
    const older = waiting("old", "casual", 2, 10);
    expect(pickPartner(waiting("me"), [waiting("new"), older], T0, RELAX)).toBe(older);
  });
  test("skips a zero score before relaxing", () =>
    expect(pickPartner(waiting("me", "listen", 1), [waiting("o", "listen", 3)], T0, RELAX)).toBeNull());
  test("accepts a zero score once someone waited long enough", () => {
    const other = waiting("o", "listen", 3, 30);
    expect(pickPartner(waiting("me", "listen", 1), [other], T0, RELAX)).toBe(other);
  });
  test("never returns a blocked guest", () =>
    expect(pickPartner(waiting("me"), [waiting("o", "casual", 2, 100)], T0, RELAX, new Set(["o"]))).toBeNull());
  test("never returns self", () => {
    const me = waiting("me", "casual", 2, 100);
    expect(pickPartner(me, [me], T0, RELAX)).toBeNull();
  });
  test("nobody waiting → null", () => expect(pickPartner(waiting("me"), [], T0, RELAX)).toBeNull());
});

describe("opening hours", () => {
  test.each([
    ["", null],
    ["   ", null],
    ["21:00-24:00", { start: 21 * 60, end: 0 }],
    ["9:30 - 11:00", { start: 9 * 60 + 30, end: 11 * 60 }],
    ["22:00-02:00", { start: 22 * 60, end: 2 * 60 }],
  ])("parses %j", (spec, expected) => expect(parseOpenHours(spec)).toEqual(expected));

  test.each(["21-24", "25:00-26:00", "21:60-22:00", "24:30-01:00", "21:00-21:00", "abc"])("rejects %j", (spec) =>
    expect(() => parseOpenHours(spec)).toThrow(/open hours/),
  );

  // Asia/Taipei is UTC+8 with no DST.
  const taipei = (h: number, m: number) => Date.UTC(2026, 9, 3, h, m) - 8 * 3600_000;
  test.each([
    [20, 59, false],
    [21, 0, true],
    [23, 59, true],
    [0, 0, false],
  ])("21:00-24:00 at %i:%i → %s", (h, m, open) =>
    expect(isOpen(taipei(h, m), parseOpenHours("21:00-24:00"), "Asia/Taipei")).toBe(open));

  test.each([
    [23, 0, true],
    [1, 59, true],
    [2, 0, false],
    [12, 0, false],
  ])("22:00-02:00 crosses midnight at %i:%i → %s", (h, m, open) =>
    expect(isOpen(taipei(h, m), parseOpenHours("22:00-02:00"), "Asia/Taipei")).toBe(open));

  test("no hours means always open", () => expect(isOpen(T0, null, "Asia/Taipei")).toBe(true));
});

describe("maskContacts", () => {
  test.each([
    ["加我 https://line.me/ti/p/abc123 吧", `加我 ${M} 吧`],
    ["www.example.com/x?y=1", M],
    ["看 my-site.tw 就好", `看 ${M} 就好`],
    ["寄到 someone.name+tag@mail.co", `寄到 ${M}`],
    ["IG @night_owl.99 找我", `IG ${M} 找我`],
    ["打 0912-345-678", `打 ${M}`],
    ["打 0912 345 678 喔", `打 ${M} 喔`],
    ["+886 912 345 678", M],
    ["０９１２３４５６７８", M], // full-width
    ["(02) 2345-6789", `(${M}`],
  ])("masks %j", (text, expected) => expect(maskContacts(text)).toBe(expected));

  test.each([
    "今天 10:30 才下班 2026 年好快",
    "我 3 點睡 7 點起",
    "分數 95.5 還不錯",
    "這句沒有聯絡方式。也沒有網址.",
    "email 的 @ 符號",
    "價格 1,200 元",
  ])("leaves %j alone", (text) => expect(maskContacts(text)).toBe(text));
});
