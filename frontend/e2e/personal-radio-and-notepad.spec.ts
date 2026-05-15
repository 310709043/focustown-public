import { expect, test, type Route } from "@playwright/test";

import { fixtures, json, mockApi } from "./helpers/mock-backend";
import { seedAuthTokens } from "./helpers/session";

/**
 * Phase 10 — per-user random music + private/shared notepad.
 *
 * Three cases that together prove the frontend really exercises the
 * new backend surface:
 *
 *   1. Solo focus session
 *      - `PersonalRadio` fetches ``GET /api/v1/playback/playlist?context=focus&context_id=solo``
 *      - audio.src points at ``tracksApi.streamUrl(firstTrack.id)``
 *      - "🔊 點擊聆聽" autoplay-unlock pill is visible (autoplay blocked)
 *      - The legacy private-only `NotesPanel` is mounted, NOT `SharedNotesPanel`
 *
 *   2. Paired focus session
 *      - Same playlist call, but ``context_id`` = match id
 *      - `SharedNotesPanel` is mounted (the "共享" tab is visible)
 *      - Partner's pre-seeded shared note appears in the shared tab
 *      - Creating a note with "與夥伴共享" checked round-trips through
 *        ``POST /api/v1/notes`` with ``shared_in_match_id`` set, and
 *        the new note is then visible in the shared tab
 *
 *   3. City personal radio
 *      - ``/town`` mounts a `PersonalRadio` with ``context=city``
 *      - The playlist endpoint is invoked with the right query params
 *
 * Drift / autoplay are intentionally NOT asserted — Chromium headless
 * blocks autoplay and the audio element advances on wall clock. The
 * deterministic surface is ``audio.src``, which both modes set.
 */

const SEED_TRACK = {
  id: "t-radio-1",
  title: "E2E Radio Track",
  artist: "E2E Artist",
  mood: "lofi",
  duration_ms: 60_000,
  content_type: "audio/mpeg",
};

const SEED_TRACK_2 = {
  id: "t-radio-2",
  title: "E2E Radio Track 2",
  artist: "E2E Artist",
  mood: "lofi",
  duration_ms: 60_000,
  content_type: "audio/mpeg",
};

function playlistResponse(
  context: "city" | "focus" | "room",
  contextId: string | null,
) {
  return {
    context,
    context_id: contextId,
    day: "2026-05-16",
    tracks: [SEED_TRACK, SEED_TRACK_2],
  };
}

function focusBaselineMocks() {
  // Endpoints called on /focus/[id] mount (excluding playlist + notes).
  // Splash gate is unlocked by `seedAuthTokens` (it sets ft.splash.seen).
  return {
    "GET  /api/v1/auth/me": (r: Route) => json(r, 200, fixtures.user),
    "GET  /api/v1/me/wallet": (r: Route) => json(r, 200, []),
    "GET  /api/v1/me/items": (r: Route) => json(r, 200, []),
  };
}

test.describe("Phase 10 — per-user radio + shared notepad", () => {
  test("solo focus: PersonalRadio uses playlist API + NotesPanel (not shared)", async ({
    page,
  }) => {
    let playlistCallCount = 0;
    let lastPlaylistQuery: { context: string | null; context_id: string | null } = {
      context: null,
      context_id: null,
    };

    await mockApi(page, {
      ...focusBaselineMocks(),
      "GET  /api/v1/notes": (r) => json(r, 200, []),
      "GET  /api/v1/playback/playlist": (r) => {
        playlistCallCount += 1;
        const url = new URL(r.request().url());
        lastPlaylistQuery = {
          context: url.searchParams.get("context"),
          context_id: url.searchParams.get("context_id"),
        };
        return json(r, 200, playlistResponse("focus", "solo"));
      },
    });
    await seedAuthTokens(page);

    await page.goto("/focus/solo");
    await expect(page.getByTestId("splash")).toBeHidden({ timeout: 10_000 });

    // The personal-radio panel renders the first track from the
    // mocked playlist response.
    await expect(page.getByText(SEED_TRACK.title)).toBeVisible({
      timeout: 5_000,
    });

    // The hidden <audio> binds to the stream URL of the first track.
    await expect
      .poll(
        () =>
          page.locator("audio").first().evaluate(
            (el: HTMLAudioElement, suffix: string) => el.src.endsWith(suffix),
            `/api/v1/tracks/${SEED_TRACK.id}/stream`,
          ),
        { timeout: 5_000 },
      )
      .toBe(true);

    // Autoplay blocked → the unlock pill is visible.
    await expect(page.getByText("🔊 點擊聆聽")).toBeVisible();

    // The playlist endpoint was invoked with the right context.
    expect(playlistCallCount).toBeGreaterThanOrEqual(1);
    expect(lastPlaylistQuery).toEqual({
      context: "focus",
      context_id: "solo",
    });

    // SharedNotesPanel exposes a "共享" tab; the legacy NotesPanel
    // does not. Solo mode must mount the legacy one.
    await expect(page.getByRole("button", { name: "共享" })).toHaveCount(0);
  });

  test("paired focus: PersonalRadio + SharedNotesPanel (shared note round-trip)", async ({
    page,
  }) => {
    const MATCH_ID = "match-e2e-1";
    const PARTNER_USER_ID = "u-partner";

    type Note = {
      id: string;
      user_id: string;
      title: string;
      body: string;
      done: boolean;
      created_at: string;
      updated_at: string;
      shared_in_match_id: string | null;
    };

    let notes: Note[] = [
      {
        id: "n-partner-1",
        user_id: PARTNER_USER_ID,
        title: "Partner's shared note",
        body: "Read me from the other side",
        done: false,
        created_at: "2026-05-16T11:00:00Z",
        updated_at: "2026-05-16T11:00:00Z",
        shared_in_match_id: MATCH_ID,
      },
    ];
    let lastCreatedShareId: string | null | undefined = undefined;

    await mockApi(page, {
      ...focusBaselineMocks(),
      "GET  /api/v1/notes": (r) => {
        const matchId = new URL(r.request().url()).searchParams.get("match_id");
        if (matchId === MATCH_ID) return json(r, 200, notes);
        // No match_id → owner-only (mirrors backend behavior).
        return json(
          r,
          200,
          notes.filter((n) => n.user_id === fixtures.user.id),
        );
      },
      "POST /api/v1/notes": async (r) => {
        const body = JSON.parse(r.request().postData() ?? "{}");
        lastCreatedShareId = body.shared_in_match_id;
        const note: Note = {
          id: `n-new-${notes.length}`,
          user_id: fixtures.user.id,
          title: body.title ?? "",
          body: body.body ?? "",
          done: false,
          created_at: "2026-05-16T12:00:00Z",
          updated_at: "2026-05-16T12:00:00Z",
          shared_in_match_id: body.shared_in_match_id ?? null,
        };
        notes = [note, ...notes];
        return json(r, 201, note);
      },
      "GET  /api/v1/playback/playlist": (r) =>
        json(r, 200, playlistResponse("focus", MATCH_ID)),
    });
    await seedAuthTokens(page);

    await page.goto(`/focus/${MATCH_ID}`);
    await expect(page.getByTestId("splash")).toBeHidden({ timeout: 10_000 });

    // SharedNotesPanel mounted: scope-tab buttons + checkbox.
    await expect(page.getByRole("button", { name: "共享" })).toBeVisible();
    await expect(page.getByRole("button", { name: "私人" })).toBeVisible();

    // The partner's pre-seeded shared note shows up in the default
    // (shared) tab.
    await expect(page.getByText("Partner's shared note")).toBeVisible({
      timeout: 5_000,
    });

    // Switch to private — partner's shared note disappears.
    await page.getByRole("button", { name: "私人" }).click();
    await expect(page.getByText("Partner's shared note")).toHaveCount(0);

    // Back to shared, then author + submit a shared note.
    await page.getByRole("button", { name: "共享" }).click();
    await page.getByTestId("shared-note-title").fill("E2E shared title");
    await page.getByTestId("shared-note-body").fill("E2E shared body");
    // 「與夥伴共享」 checkbox defaults to checked, so we don't toggle it.

    // The add button's label comes from i18n; match by surrounding text rather
    // than exact translation key to stay locale-stable.
    await page.getByRole("button", { name: /新增|Add/ }).click();

    // POST round-tripped with the right shared_in_match_id.
    await expect
      .poll(() => lastCreatedShareId, { timeout: 5_000 })
      .toBe(MATCH_ID);

    // The new note now appears in the shared tab.
    await expect(page.getByText("E2E shared title")).toBeVisible({
      timeout: 5_000,
    });

    // Personal radio still rendered (paired session also gets one).
    await expect(page.getByText(SEED_TRACK.title)).toBeVisible();
  });

  test("city: /town PersonalRadio calls playlist with context=city", async ({
    page,
  }) => {
    let lastContext: string | null = null;

    await mockApi(page, {
      "GET  /api/v1/auth/me": (r) => json(r, 200, fixtures.user),
      "GET  /api/v1/presence/street": (r) => json(r, 200, []),
      "GET  /api/v1/me/wallet": (r) => json(r, 200, []),
      "GET  /api/v1/me/items": (r) => json(r, 200, []),
      "GET  /api/v1/tracks": (r) => json(r, 200, []),
      "GET  /api/v1/me/room": (r) =>
        json(r, 200, {
          id: "room-self",
          owner_user_id: fixtures.user.id,
          name: "Self Room",
          theme: "night",
          visibility: "public",
          max_visitors: 5,
          created_at: "2026-05-01T00:00:00Z",
          updated_at: "2026-05-01T00:00:00Z",
        }),
      "GET  /api/v1/me/room/tracks": (r) => json(r, 200, []),
      "GET  /api/v1/shop": (r) => json(r, 200, []),
      "GET  /api/v1/playback/playlist": (r) => {
        lastContext = new URL(r.request().url()).searchParams.get("context");
        return json(r, 200, playlistResponse("city", "city"));
      },
    });
    await seedAuthTokens(page);

    await page.goto("/town");
    await expect(page.getByTestId("splash")).toBeHidden({ timeout: 10_000 });

    await expect(page.getByText("城市電台")).toBeVisible({ timeout: 5_000 });
    await expect
      .poll(() => lastContext, { timeout: 5_000 })
      .toBe("city");

    // Audio src bound to the first city track.
    await expect
      .poll(
        () =>
          page.locator("audio").first().evaluate(
            (el: HTMLAudioElement, suffix: string) => el.src.endsWith(suffix),
            `/api/v1/tracks/${SEED_TRACK.id}/stream`,
          ),
        { timeout: 5_000 },
      )
      .toBe(true);
  });
});
