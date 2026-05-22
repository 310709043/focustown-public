/**
 * time-greeting — picks one of four period strings off `Date.getHours()`.
 *
 * Worth testing:
 * - Each boundary hour maps to the documented period.
 * - Default arg (now = new Date()) yields a Period string.
 *
 * NOT worth testing:
 * - Timezone behaviour — the function is locale-clock agnostic by design.
 */
import { expect, test } from "vitest";

import { currentPeriod } from "@/lib/utils/time-greeting";

function at(hour: number): Date {
  const d = new Date(2026, 4, 22, hour, 0, 0);
  return d;
}

test("hours before 5 read as night (late-night carry-over)", () => {
  expect(currentPeriod(at(0))).toBe("night");
  expect(currentPeriod(at(2))).toBe("night");
  expect(currentPeriod(at(4))).toBe("night");
});

test("05:00–11:59 reads as morning", () => {
  expect(currentPeriod(at(5))).toBe("morning");
  expect(currentPeriod(at(11))).toBe("morning");
});

test("12:00–16:59 reads as afternoon", () => {
  expect(currentPeriod(at(12))).toBe("afternoon");
  expect(currentPeriod(at(16))).toBe("afternoon");
});

test("17:00–19:59 reads as evening", () => {
  expect(currentPeriod(at(17))).toBe("evening");
  expect(currentPeriod(at(19))).toBe("evening");
});

test("20:00 and later reads as night", () => {
  expect(currentPeriod(at(20))).toBe("night");
  expect(currentPeriod(at(23))).toBe("night");
});

test("default argument (no Date passed) returns a valid period", () => {
  const p = currentPeriod();
  expect(["morning", "afternoon", "evening", "night"]).toContain(p);
});
