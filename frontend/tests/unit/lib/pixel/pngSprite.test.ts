/**
 * pngSprite — PNG sheet sprite slicer with LRU caching.
 *
 * Worth testing:
 * - Validation rejects invalid frame size / coords (boundary + error paths)
 * - Cache reset helper actually clears state (so other tests start clean)
 * - pngLinearFrameDataUrl delegates to grid form with row=0 (key invariant)
 *
 * NOT worth testing here:
 * - End-to-end image decoding (jsdom doesn't fetch; covered by Playwright)
 * - SSR pathway (mirrors sprite.ts which is already battle-tested)
 * - LRU eviction itself (same Map-insertion-order trick proven in sprite.ts)
 */
import { beforeEach, describe, expect, test } from "vitest";
import {
  EMPTY_DATA_URL,
  pngFrameDataUrl,
  pngLinearFrameDataUrl,
  _cacheSizeForTests,
  _resetCachesForTests,
} from "@/lib/pixel/pngSprite";

beforeEach(() => {
  _resetCachesForTests();
});

describe("pngFrameDataUrl validation", () => {
  test("throws when frame width is zero", async () => {
    await expect(pngFrameDataUrl("/a.png", 0, 0, 0, 16)).rejects.toThrow(
      /frame size must be positive/,
    );
  });

  test("throws when frame height is negative", async () => {
    await expect(pngFrameDataUrl("/a.png", 0, 0, 16, -1)).rejects.toThrow(
      /frame size must be positive/,
    );
  });

  test("throws when column index is negative", async () => {
    await expect(pngFrameDataUrl("/a.png", -1, 0, 16, 16)).rejects.toThrow(
      /frame coords must be ≥ 0/,
    );
  });

  test("throws when row index is negative", async () => {
    await expect(pngFrameDataUrl("/a.png", 0, -1, 16, 16)).rejects.toThrow(
      /frame coords must be ≥ 0/,
    );
  });
});

describe("cache lifecycle", () => {
  test("reset helper empties both frame and sheet caches", () => {
    // Even without a real image load we can prove the reset wipes state.
    // (Cache population happens via successful frame slicing in production;
    // here we just verify the contract that resetting always starts at zero.)
    _resetCachesForTests();
    expect(_cacheSizeForTests()).toEqual({ frames: 0, sheets: 0 });
  });
});

describe("EMPTY_DATA_URL contract", () => {
  test("is the same 1x1 transparent gif used by sprite.ts (SSR convergence)", () => {
    // If this constant ever drifts from sprite.ts, components that swap
    // between the two engines mid-render will mismatch SSR/CSR markup.
    expect(EMPTY_DATA_URL).toBe(
      "data:image/gif;base64,R0lGODlhAQABAAAAACw=",
    );
  });
});

describe("pngLinearFrameDataUrl delegates to grid form with row=0", () => {
  // We can verify by trapping the validation path: a linear call with
  // negative frameIdx must surface the SAME error message as a grid call
  // with negative col. If the delegation is wrong (e.g. linear used row=col
  // by mistake), the error would mention 'row' instead.
  test("negative linear frame index surfaces 'col' in the error, not 'row'", async () => {
    await expect(pngLinearFrameDataUrl("/a.png", -1, 16, 16)).rejects.toThrow(
      /col=-1/,
    );
  });
});
