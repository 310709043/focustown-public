/**
 * fmtMS — render seconds as MM:SS.
 *
 * Worth testing the corner cases that have actually broken display in
 * other Pomodoro UIs:
 * - zero
 * - negative (treat as zero, never render "-00:01")
 * - exactly one minute boundary
 * - fractional seconds (floor, not round)
 * - > 1 hour (we deliberately keep going past 60:00; no hour roll-over)
 */
import { expect, test } from "vitest";
import { fmtMS } from "@/lib/format";

test.each([
  [0, "00:00"],
  [-5, "00:00"],
  [59, "00:59"],
  [60, "01:00"],
  [61, "01:01"],
  [1.7, "00:01"],
  [3600, "60:00"],
  [3661, "61:01"],
])("fmtMS(%i) === %s", (input, expected) => {
  expect(fmtMS(input)).toBe(expected);
});
