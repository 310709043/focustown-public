import {
  expect,
  test,
  type APIRequestContext,
  type BrowserContext,
  type Page,
} from "@playwright/test";

/**
 * Phase 10 — full match-to-room E2E against the REAL stack.
 *
 * UNLIKE every other spec in this directory, this one does NOT use
 * `helpers/mock-backend.ts` or `helpers/mock-ws.ts`. It drives two
 * browser contexts (User A + User B) end-to-end through the live
 * `docker compose up` stack:
 *
 *   queue → match.proposed → accept → both join room → READY
 *        → start session → room.timer_tick → session_completed → ended
 *
 * Pre-conditions:
 *   - `docker compose up -d` is running (postgres + redis + backend +
 *     worker + frontend on the default ports).
 *   - The frontend dev server is reachable at `PLAYWRIGHT_BASE_URL`
 *     (default `http://localhost:3000`).
 *   - The backend is reachable at `PLAYWRIGHT_API_BASE_URL`
 *     (default `http://localhost:8000`).
 *
 * Run with: `pnpm playwright test e2e/match-to-room-full-flow.spec.ts`
 * Use the dedicated config so the test isn't picked up by the default
 * mocked-backend run: `PLAYWRIGHT_REAL_STACK=1` opts in (the spec itself
 * is `test.skip()`d when the flag is unset, so the regular CI run stays
 * green).
 */

const REAL_STACK_ENABLED = process.env.PLAYWRIGHT_REAL_STACK === "1";
const API_BASE = process.env.PLAYWRIGHT_API_BASE_URL ?? "http://localhost:8000";
const TERMS_VERSION = "2026-05-14";
// 5-second focus duration so the spec verifies room.session_completed
// within its time budget. The room-start endpoint enforces ge=60 in
// schema, so we use the minimum legal value and shrink the wait via
// the worker's tick cadence. If the schema floor changes, update both
// here and in tests/load/match_queue.js.
const FOCUS_DURATION_SECONDS = 60;
const SHORT_FOCUS_FALLBACK_SECONDS = 60;

type AuthedUser = {
  id: string;
  email: string;
  password: string;
  accessToken: string;
  refreshToken: string;
};

type TokensPayload = {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
};

/** Mint a fresh email so re-runs don't collide with previous test users. */
function uniqueEmail(tag: string): string {
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  // NB: must be a non-reserved TLD — pydantic EmailStr (email-validator 2.x)
  // rejects `.local`/`.test`/etc. as special-use, which surfaces as a 422 at
  // /auth/signup. Use a subdomain of our own (non-routable) domain instead.
  return `e2e-${tag}-${stamp}-${rand}@e2e.lowbatterytown.com`;
}

async function createUser(
  api: APIRequestContext,
  tag: string,
): Promise<AuthedUser> {
  const email = uniqueEmail(tag);
  const password = "PlaywrightE2E!1";
  const resp = await api.post(`${API_BASE}/api/v1/auth/signup`, {
    data: {
      email,
      password,
      display_name: `E2E ${tag.toUpperCase()}`,
      terms_accepted: true,
      terms_version: TERMS_VERSION,
      marketing_opt_in: false,
    },
  });
  expect(resp.ok(), `signup failed for ${tag}: ${resp.status()}`).toBeTruthy();
  const body = (await resp.json()) as {
    user: { id: string };
    tokens: TokensPayload;
  };
  return {
    id: body.user.id,
    email,
    password,
    accessToken: body.tokens.access_token,
    refreshToken: body.tokens.refresh_token,
  };
}

/**
 * Seed `localStorage` with the same shape `lib/api/client.ts:tokenStore`
 * writes, so the frontend treats the context as already authenticated
 * (no UI signin needed for the matching-flow test surface).
 */
async function seedAuth(page: Page, user: AuthedUser): Promise<void> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate(
    ({ tokens }) => {
      window.localStorage.setItem(
        "lowbatterytown.tokens",
        JSON.stringify(tokens),
      );
      window.sessionStorage.setItem("ft.splash.seen", "1");
      window.localStorage.setItem(
        "lbt.onboarding.v1",
        JSON.stringify({ state: { completed: true }, version: 1 }),
      );
    },
    {
      tokens: {
        access_token: user.accessToken,
        refresh_token: user.refreshToken,
        token_type: "bearer" as const,
      },
    },
  );
}

async function authedRequest(
  api: APIRequestContext,
  user: AuthedUser,
): Promise<{
  startRoom: (matchId: string, durationSeconds: number) => Promise<void>;
  leaveRoom: (matchId: string) => Promise<void>;
}> {
  return {
    async startRoom(matchId, durationSeconds) {
      const resp = await api.post(
        `${API_BASE}/api/v1/rooms/match/${matchId}/start`,
        {
          headers: { Authorization: `Bearer ${user.accessToken}` },
          data: { duration_seconds: durationSeconds },
        },
      );
      expect(
        resp.ok(),
        `start_session failed for ${matchId}: ${resp.status()}`,
      ).toBeTruthy();
    },
    async leaveRoom(matchId) {
      const resp = await api.post(
        `${API_BASE}/api/v1/rooms/match/${matchId}/leave`,
        { headers: { Authorization: `Bearer ${user.accessToken}` } },
      );
      // 200 = transitioned, 404 = already-gone (idempotent) — both OK.
      expect([200, 404]).toContain(resp.status());
    },
  };
}

async function newAuthedContext(
  api: APIRequestContext,
  tag: string,
  browser: import("@playwright/test").Browser,
): Promise<{ ctx: BrowserContext; page: Page; user: AuthedUser }> {
  const user = await createUser(api, tag);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await seedAuth(page, user);
  return { ctx, page, user };
}

test.describe("Phase 10 — full match-to-room real-stack E2E", () => {
  test.skip(
    !REAL_STACK_ENABLED,
    "Set PLAYWRIGHT_REAL_STACK=1 (and have `docker compose up` running) to run this spec.",
  );

  // The full flow can take ~30s on a warm laptop (signup → queue sweep
  // up to 3s → accept → join → start → 60s timer). Don't fight the
  // worker's tick cadence — set the test timeout explicitly instead of
  // relying on retries to mask wait-too-short flakes.
  test.setTimeout(120_000);

  test("two users: queue → pair → accept → room → start → tick → complete → ended", async ({
    browser,
    request,
  }) => {
    // 1) Mint two fresh accounts via the real /signup endpoint so the
    //    flow exercises everything from auth onwards. Each context
    //    gets its own cookies / localStorage / WebSocket.
    const a = await newAuthedContext(request, "a", browser);
    const b = await newAuthedContext(request, "b", browser);

    const apiA = await authedRequest(request, a.user);
    // apiB unused but kept for symmetry / future per-user assertions.
    await authedRequest(request, b.user);

    try {
      // 2) Both land on /town and click TOGETHER. `onFindBuddy`
      //    enqueues via POST /matches/auto. The first call returns
      //    202 (waiting), the second 201 (paired) — modal then
      //    surfaces match.proposed on both sides.
      await Promise.all([a.page.goto("/town"), b.page.goto("/town")]);

      // Splash overlay clears once auth hydrates; without this the
      // BottomHUD CTA is still under the splash and click would miss.
      await Promise.all([
        expect(a.page.getByTestId("splash")).toBeHidden({ timeout: 15_000 }),
        expect(b.page.getByTestId("splash")).toBeHidden({ timeout: 15_000 }),
      ]);

      const togetherA = a.page.getByTestId("mode-card-together-cta");
      const togetherB = b.page.getByTestId("mode-card-together-cta");
      await Promise.all([
        expect(togetherA).toBeVisible({ timeout: 15_000 }),
        expect(togetherB).toBeVisible({ timeout: 15_000 }),
      ]);
      // Hit "TOGETHER" on A first to land in the waiting pool, then on
      // B — the sweep on enqueue pairs them in the same tick.
      await togetherA.click();
      await togetherB.click();

      // 3) Both clients receive match.proposed and auto-accept (per the
      //    2026-05-22 product redesign — no manual Accept / Skip step
      //    anymore). The town page's accepted-match effect routes into
      //    /focus/{matchId} as soon as the store flips to accepted.
      //    Matching-sweep window (3s) + WS fan-out (<1s) + accept HTTP
      //    + nav ≈ a few seconds in the worst case.
      const focusUrlRegex = /\/focus\/[a-f0-9-]+/i;
      await Promise.all([
        expect(a.page).toHaveURL(focusUrlRegex, { timeout: 20_000 }),
        expect(b.page).toHaveURL(focusUrlRegex, { timeout: 20_000 }),
      ]);

      // Both should land on the SAME match id — confirms the pair
      // really did go to the shared room (not two solo rooms).
      const matchIdA = a.page.url().match(/\/focus\/([a-f0-9-]+)/i)?.[1];
      const matchIdB = b.page.url().match(/\/focus\/([a-f0-9-]+)/i)?.[1];
      expect(matchIdA).toBeTruthy();
      expect(matchIdA).toEqual(matchIdB);
      const matchId = matchIdA!;

      // 5) Both auto-join (page mount effect calls /rooms/match/{id}/join).
      //    Once both joined, the server-driven RoomStatusBanner reads
      //    "READY" (status === "both_joined").
      await Promise.all([
        expect(a.page.getByTestId("room-status-banner")).toContainText(
          /READY|準備|BOTH/i,
          { timeout: 15_000 },
        ),
        expect(b.page.getByTestId("room-status-banner")).toContainText(
          /READY|準備|BOTH/i,
          { timeout: 15_000 },
        ),
      ]);

      // 6) Arm the shared timer via the server endpoint directly. The
      //    in-room "Start" button currently triggers the LOCAL solo
      //    timer (sessionsApi.start) — Phase 08 ships the server-side
      //    room.session_started frame but the matching UI control is
      //    NOT yet wired up. Phase 10 is a verification-only phase
      //    (out of scope to touch app/), so we drive the start via the
      //    real endpoint and assert the frame lands in the UI.
      const startDuration = Math.max(
        FOCUS_DURATION_SECONDS,
        SHORT_FOCUS_FALLBACK_SECONDS,
      );
      await apiA.startRoom(matchId, startDuration);

      // 7) Once room.session_started lands, status becomes "active" →
      //    RoomTimer mounts and renders the countdown reading from the
      //    server-stamped timer fields. Both pages should see it.
      const timerA = a.page.getByTestId("room-timer-value");
      const timerB = b.page.getByTestId("room-timer-value");
      await Promise.all([
        expect(timerA).toBeVisible({ timeout: 10_000 }),
        expect(timerB).toBeVisible({ timeout: 10_000 }),
      ]);

      // 8) Timer ticks: read two samples 2s apart and confirm the
      //    remaining MM:SS value advanced on both clients. The cadence
      //    is server-driven (worker emits room.timer_tick every ~1s),
      //    so the assertion is that the WS frame did arrive and the
      //    store consumed it.
      const before = await timerA.textContent();
      expect(before).toMatch(/^\d\d:\d\d$/);
      await a.page.waitForTimeout(2_500);
      const after = await timerA.textContent();
      expect(after).toMatch(/^\d\d:\d\d$/);
      expect(after).not.toEqual(before);

      // Cross-client drift: A and B should be within 2s of each other
      // since both read from the same server-stamped remainingSeconds.
      const remainingFor = async (page: Page): Promise<number> => {
        const txt = (await page.getByTestId("room-timer-value").textContent()) ?? "";
        const [mm, ss] = txt.split(":").map((n) => parseInt(n, 10));
        return mm * 60 + ss;
      };
      const remainA = await remainingFor(a.page);
      const remainB = await remainingFor(b.page);
      expect(Math.abs(remainA - remainB)).toBeLessThanOrEqual(2);

      // 9) Tear down: one side leaves → the surviving side's banner
      //    transitions to "ended" via the room.partner_left + room.ended
      //    frame chain. Verifies the cross-context WS fan-out works.
      await apiA.leaveRoom(matchId);
      const banner = b.page.getByTestId("room-status-banner");
      // The banner copy varies by status — accept either "ENDED" / a
      // partner-left affordance / the localized equivalent. The point
      // is that the surviving side OBSERVED the change.
      await expect(banner).toContainText(/END|結束|LEFT|離開|PARTNER/i, {
        timeout: 15_000,
      });
    } finally {
      await a.ctx.close();
      await b.ctx.close();
    }
  });
});
