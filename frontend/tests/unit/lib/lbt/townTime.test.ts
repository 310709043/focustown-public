/**
 * Town time: the pure helpers and the self-contained `applyTownTime`
 * (which also runs stringified before first paint) must agree on every
 * minute of the day, and the preview query may only pick known states.
 */
import { describe, expect, test } from "vitest";

import { TOWN_TIME_BOOT, applyTownTime, townTimeAt, townWeekAt } from "@/lib/lbt/townTime";

// 2026-10-05 is a Monday.
const at = (day: number, h: number, m = 0) => new Date(2026, 9, 5 + day, h, m);

describe("townTimeAt", () => {
  test.each([
    [4, 59, "night"],
    [5, 0, "dawn"],
    [6, 29, "dawn"],
    [6, 30, "day"],
    [16, 59, "day"],
    [17, 0, "dusk"],
    [18, 59, "dusk"],
    [19, 0, "night"],
    [0, 0, "night"],
  ] as const)("%i:%i → %s", (h, m, want) => {
    expect(townTimeAt(at(0, h, m))).toBe(want);
  });
});

describe("townWeekAt", () => {
  test("Mon–Fri weekday, Sat–Sun weekend", () => {
    const weeks = [0, 1, 2, 3, 4, 5, 6].map((d) => townWeekAt(at(d, 12)));
    expect(weeks).toEqual(["weekday", "weekday", "weekday", "weekday", "weekday", "weekend", "weekend"]);
  });
});

describe("applyTownTime", () => {
  test("agrees with townTimeAt / townWeekAt for every minute of a week", () => {
    const root = document.createElement("html");
    for (let d = 0; d < 7; d += 1) {
      for (let m = 0; m < 24 * 60; m += 1) {
        const now = at(d, 0, m);
        applyTownTime(root, now);
        expect(root.getAttribute("data-lbt-time")).toBe(townTimeAt(now));
        expect(root.getAttribute("data-lbt-week")).toBe(townWeekAt(now));
      }
    }
  });

  test("?time= and ?week= preview known states only", () => {
    const root = document.createElement("html");
    applyTownTime(root, at(0, 12), "?time=night&week=weekend");
    expect(root.getAttribute("data-lbt-time")).toBe("night");
    expect(root.getAttribute("data-lbt-week")).toBe("weekend");

    applyTownTime(root, at(0, 12), "?time=<script>&week=holiday");
    expect(root.getAttribute("data-lbt-time")).toBe("day");
    expect(root.getAttribute("data-lbt-week")).toBe("weekday");
  });

  test("the boot script is self-contained and sets the attributes", () => {
    const html = document.documentElement;
    html.removeAttribute("data-lbt-time");
    html.removeAttribute("data-lbt-week");
    new Function(TOWN_TIME_BOOT)();
    expect(html.getAttribute("data-lbt-time")).toMatch(/^(dawn|day|dusk|night)$/);
    expect(html.getAttribute("data-lbt-week")).toMatch(/^(weekday|weekend)$/);
  });
});
