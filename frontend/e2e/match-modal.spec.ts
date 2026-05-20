import { expect, test } from "@playwright/test";

import { baselineTownMocks, json, mockApi } from "./helpers/mock-backend";
import { seedAuthTokens } from "./helpers/session";

/**
 * Structural alignment for `<MatchModal>`. Triggered from /town by
 * seeding the in-memory matchStore directly via the test-only
 * `window.__ftMatchStore` bridge — avoids the realtime fan-out path so
 * the modal is deterministic. The bridge lives in
 * `frontend/lib/state/matchStore.ts` and is gated to non-production
 * builds. See `docs/qa/v1-handoff.md` Known Limitations for the
 * original gap this closes.
 */
test.describe("MatchModal — reference parity", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page, {
      ...baselineTownMocks(),
      "GET  /api/v1/me/room": (r) =>
        json(r, 200, {
          id: "room-test-1",
          owner_user_id: "u-test-1",
          name: "Smoke's Room",
          theme: { wallpaper: "stars", floor: "wood", accent: "purple" },
          created_at: "2026-05-01T00:00:00Z",
        }),
    });
    await seedAuthTokens(page);
  });

  test("modal renders 10-segment compat bar + Accept (primary) + Skip", async ({ page }) => {
    await page.goto("/town");
    await expect(page.getByTestId("splash")).toBeHidden({ timeout: 10_000 });

    // Wait for the matchStore module to evaluate on the client — its
    // top-level side effect attaches the bridge to `window`. Under cold
    // dev-server compiles this can race the splash-hidden check.
    await page.waitForFunction(
      () =>
        !!(window as unknown as { __ftMatchStore?: unknown }).__ftMatchStore,
      undefined,
      { timeout: 10_000 },
    );

    // Inject a proposal via the test bridge. The town page reacts to
    // `current` becoming non-null and opens the modal.
    await page.evaluate(() => {
      type Bridge = {
        __ftMatchStore?: {
          testInjectProposal: (m: Record<string, unknown>) => void;
        };
      };
      const w = window as unknown as Bridge;
      if (!w.__ftMatchStore) {
        throw new Error("__ftMatchStore bridge not exposed — non-prod build expected");
      }
      w.__ftMatchStore.testInjectProposal({
        id: "m-e2e-1",
        requester_id: "u-test-1",
        candidate_id: "u-candidate-1",
        requester_character_key: "luna",
        candidate_character_key: "pixel",
        compatibility: 80,
        reason: "You both focus best in the evening.",
        status: "pending",
        created_at: "2026-05-15T20:00:00Z",
      });
    });

    // Modal mounts via the reactive open-on-current effect in town/page.tsx.
    const modal = page.getByTestId("match-modal");
    await expect(modal).toBeVisible({ timeout: 5_000 });

    // 10-segment compatibility bar — exact count, regardless of how many
    // are lit (lighting is staggered by an interval and may not have
    // completed by the time we assert).
    const segments = modal.locator('[data-testid="compat-bar"] [data-segment]');
    await expect(segments).toHaveCount(10);

    // Compatibility 80 → 8 lit segments once the stagger finishes.
    // Each segment takes 80ms to fill; wait long enough for all 8.
    await expect(
      modal.locator('[data-testid="compat-bar"] [data-segment][data-lit]'),
    ).toHaveCount(8, { timeout: 5_000 });

    // Primary CTA (Accept) + secondary (Skip) — locale-agnostic via
    // testids, so the assertions stay green across i18n drift.
    const accept = modal.getByTestId("match-accept");
    const skip = modal.getByTestId("match-skip");
    await expect(accept).toBeVisible();
    await expect(skip).toBeVisible();

    // "Primary" is encoded by the `pixel-btn primary` class combo. We
    // assert on the class rather than computed styles — the styling
    // contract lives in globals.css and changing it should fail this
    // assertion deliberately.
    await expect(accept).toHaveClass(/\bprimary\b/);
    await expect(skip).not.toHaveClass(/\bprimary\b/);
  });

  test("Skip chains to next candidate — modal stays open with new match", async ({ page }) => {
    // Round-2 QA fix: clicking "下一個" / Skip used to clear current +
    // close the modal, exiting the matching flow. The user expects "show
    // me another candidate". `matchStore.skip()` now chains skip →
    // matchesApi.auto() so the modal stays open with proposal B.
    await mockApi(page, {
      ...baselineTownMocks(),
      "GET  /api/v1/me/room": (r) =>
        json(r, 200, {
          id: "room-test-1",
          owner_user_id: "u-test-1",
          name: "Smoke's Room",
          theme: { wallpaper: "stars", floor: "wood", accent: "purple" },
          created_at: "2026-05-01T00:00:00Z",
        }),
      "POST /api/v1/matches/m-e2e-1/skip": (r) => json(r, 200, {}),
      "POST /api/v1/matches/auto": (r) =>
        json(r, 201, {
          id: "m-e2e-2",
          requester_id: "u-test-1",
          candidate_id: "u-candidate-2",
          requester_character_key: "luna",
          candidate_character_key: "spark",
          compatibility: 65,
          reason: "Both prefer pomodoro stacks of 4.",
          status: "pending",
          created_at: "2026-05-15T20:01:00Z",
        }),
    });

    await page.goto("/town");
    await expect(page.getByTestId("splash")).toBeHidden({ timeout: 10_000 });
    await page.waitForFunction(
      () =>
        !!(window as unknown as { __ftMatchStore?: unknown }).__ftMatchStore,
      undefined,
      { timeout: 10_000 },
    );

    await page.evaluate(() => {
      type Bridge = {
        __ftMatchStore?: {
          testInjectProposal: (m: Record<string, unknown>) => void;
        };
      };
      (window as unknown as Bridge).__ftMatchStore!.testInjectProposal({
        id: "m-e2e-1",
        requester_id: "u-test-1",
        candidate_id: "u-candidate-1",
        requester_character_key: "luna",
        candidate_character_key: "pixel",
        compatibility: 80,
        reason: "You both focus best in the evening.",
        status: "pending",
        created_at: "2026-05-15T20:00:00Z",
      });
    });

    const modal = page.getByTestId("match-modal");
    await expect(modal).toBeVisible({ timeout: 5_000 });

    // Read the candidate name shown for proposal A so we can assert it
    // changes after skip. The candidate name is the second visible text
    // line inside the modal; testids on the match candidate row don't
    // exist yet so we hash via the compatibility readout instead.
    const compatBefore = await modal
      .locator('[data-testid="compat-bar"] [data-segment][data-lit]')
      .count();
    expect(compatBefore).toBeGreaterThan(0);

    // Click Skip → store dispatches skip + auto, parent re-renders with
    // proposal B. Modal must stay open.
    await modal.getByTestId("match-skip").click();

    // After the chain settles the new compatibility (65) → 6 lit segments.
    await expect(
      modal.locator('[data-testid="compat-bar"] [data-segment][data-lit]'),
    ).toHaveCount(6, { timeout: 5_000 });
    await expect(modal).toBeVisible();
  });

  test("Skip when no candidates left — modal closes gracefully", async ({ page }) => {
    // Counterpart to the happy-path skip test: when matchesApi.auto()
    // 409s (no_match_candidate_available), `current` ends up null and
    // the MatchModal closes itself.
    await mockApi(page, {
      ...baselineTownMocks(),
      "GET  /api/v1/me/room": (r) =>
        json(r, 200, {
          id: "room-test-1",
          owner_user_id: "u-test-1",
          name: "Smoke's Room",
          theme: { wallpaper: "stars", floor: "wood", accent: "purple" },
          created_at: "2026-05-01T00:00:00Z",
        }),
      "POST /api/v1/matches/m-e2e-1/skip": (r) => json(r, 200, {}),
      "POST /api/v1/matches/auto": (r) =>
        json(r, 409, { code: "no_match_candidate_available" }),
    });

    await page.goto("/town");
    await expect(page.getByTestId("splash")).toBeHidden({ timeout: 10_000 });
    await page.waitForFunction(
      () =>
        !!(window as unknown as { __ftMatchStore?: unknown }).__ftMatchStore,
      undefined,
      { timeout: 10_000 },
    );

    await page.evaluate(() => {
      type Bridge = {
        __ftMatchStore?: {
          testInjectProposal: (m: Record<string, unknown>) => void;
        };
      };
      (window as unknown as Bridge).__ftMatchStore!.testInjectProposal({
        id: "m-e2e-1",
        requester_id: "u-test-1",
        candidate_id: "u-candidate-1",
        requester_character_key: "luna",
        candidate_character_key: "pixel",
        compatibility: 80,
        reason: "You both focus best in the evening.",
        status: "pending",
        created_at: "2026-05-15T20:00:00Z",
      });
    });

    const modal = page.getByTestId("match-modal");
    await expect(modal).toBeVisible({ timeout: 5_000 });

    await modal.getByTestId("match-skip").click();
    await expect(modal).toBeHidden({ timeout: 5_000 });
  });
});
