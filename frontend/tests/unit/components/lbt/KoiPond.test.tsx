/**
 * The koi pond shows the moon's reflection at night: it mounts with the
 * current town time and follows <html data-lbt-time> while it is open.
 */
import { render, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

const engine = vi.hoisted(() => {
  const setNight = vi.fn();
  const mountKoiPond = vi.fn((_host: HTMLElement, _options: { night?: boolean }) => ({
    addFish: vi.fn(),
    drawIcon: vi.fn(),
    destroy: vi.fn(),
    setNight,
  }));
  return { setNight, mountKoiPond };
});
vi.mock("@/lib/lbt/koiPond.mjs", () => ({ KOI_KINDS: ["kohaku"], mountKoiPond: engine.mountKoiPond }));

import KoiPond from "@/components/lbt/KoiPond";

afterEach(() => {
  delete document.documentElement.dataset.lbtTime;
  vi.clearAllMocks();
});

test("by day there is no moon; when the town turns to night it appears", async () => {
  document.documentElement.dataset.lbtTime = "day";
  render(<KoiPond />);
  expect(engine.mountKoiPond.mock.calls[0]?.[1]).toMatchObject({ night: false });
  document.documentElement.dataset.lbtTime = "night";
  await waitFor(() => expect(engine.setNight).toHaveBeenLastCalledWith(true));
});

test("before town time is set it counts as night, as the CSS does", () => {
  render(<KoiPond />);
  expect(engine.mountKoiPond.mock.calls[0]?.[1]).toMatchObject({ night: true });
});

test("closing the pond stops following the town time", () => {
  document.documentElement.dataset.lbtTime = "night";
  const { unmount } = render(<KoiPond />);
  unmount();
  document.documentElement.dataset.lbtTime = "day";
  expect(engine.setNight).not.toHaveBeenCalled();
});
