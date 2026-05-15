/**
 * Regression tests for the Airplane SSR hydration bug.
 *
 * Background:
 *   The original Airplane component used `useState(() => Math.random())` for
 *   the initial vertical offset, so server-side render and the first
 *   client-side render produced different `top` attributes and Next.js
 *   threw a hydration mismatch.
 *
 *   The invariant we are pinning: the FIRST render path must be
 *   deterministic. Randomisation can only happen post-mount (inside
 *   useEffect).
 *
 * Why these two specific tests:
 *   - `renderToString` twice with equal output is the cheapest way to detect
 *     any future re-introduction of `Math.random()` / `Date.now()` /
 *     `Math.floor(performance.now())` etc. into the initial render path.
 *   - The hydrate test catches the second class of bug: numeric `0` vs
 *     string `"0px"` style serialisation, which manifests only when the
 *     server's HTML actually meets a real React reconciler.
 */
import { expect, test, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { act } from "@testing-library/react";

import { Airplane } from "@/components/scene/Airplane";

test("Airplane SSR output is byte-identical across renders", () => {
  const first = renderToString(<Airplane />);
  const second = renderToString(<Airplane />);
  expect(first).toBe(second);
});

test("Airplane hydrates without console.error (no hydration mismatch)", async () => {
  const html = renderToString(<Airplane />);
  const container = document.createElement("div");
  container.innerHTML = html;
  document.body.appendChild(container);

  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

  await act(async () => {
    hydrateRoot(container, <Airplane />);
  });

  const hydrationErrors = errorSpy.mock.calls.filter((args) => {
    const msg = String(args[0] ?? "");
    return msg.includes("hydration") || msg.includes("did not match");
  });
  expect(hydrationErrors).toEqual([]);

  errorSpy.mockRestore();
  document.body.removeChild(container);
});
