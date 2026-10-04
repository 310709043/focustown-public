/**
 * The street is decorative: hidden from assistive tech, both streets
 * always rendered (CSS picks one), and the same markup on every render
 * so server and client HTML never disagree.
 */
import { render } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { TownSky, Townscape } from "@/components/lbt/Townscape";

describe("Townscape", () => {
  test("renders both streets, hidden from assistive tech", () => {
    const { container } = render(<Townscape />);
    const root = container.querySelector(".townscape");
    expect(root?.getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelector(".tw-weekday")).not.toBeNull();
    expect(container.querySelector(".tw-weekend")).not.toBeNull();
    expect(container.querySelectorAll(".tw-plate-text")).toHaveLength(2);
  });

  test("lights some windows at dusk, more at night, never all", () => {
    const { container } = render(<Townscape />);
    const all = container.querySelectorAll(".tw-win").length;
    const dusk = container.querySelectorAll(".tw-win.l1").length;
    const night = dusk + container.querySelectorAll(".tw-win.l2").length;
    expect(dusk).toBeGreaterThan(0);
    expect(night).toBeGreaterThan(dusk);
    expect(night).toBeLessThan(all / 2);
  });

  test("is deterministic", () => {
    const a = render(<Townscape />).container.innerHTML;
    const b = render(<Townscape />).container.innerHTML;
    expect(a).toBe(b);
  });

  test("sky is decorative too", () => {
    const { container } = render(<TownSky />);
    expect(container.querySelector(".town-sky")?.getAttribute("aria-hidden")).toBe("true");
  });
});
