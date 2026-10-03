/** formatClock — mm:ss for the session timer. Boundary-focused. */
import { expect, test } from "vitest";

import { formatClock } from "@/lib/lbt/format";

test.each([
  [420, "07:00"],
  [419, "06:59"],
  [61, "01:01"],
  [60, "01:00"],
  [59, "00:59"],
  [1, "00:01"],
  [0, "00:00"],
  [840, "14:00"],
  [3599, "59:59"],
])("%i seconds reads %s", (seconds, expected) => {
  expect(formatClock(seconds)).toBe(expected);
});

test("negative input clamps to zero", () => {
  expect(formatClock(-5)).toBe("00:00");
});

test("fractional seconds are floored", () => {
  expect(formatClock(59.9)).toBe("00:59");
});
