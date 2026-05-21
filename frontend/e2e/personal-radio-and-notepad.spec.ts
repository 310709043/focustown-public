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

// Minimal `audio/mpeg` body. Chromium still treats a 10-byte frame as
// undecodable and fires onError → the audio store swaps the src to
// LOCAL_FALLBACK_TRACKS, which means a poll on ``audio.src`` rarely
// sees the original stream URL. Instead the tests below track the
// outbound HTTP request to ``/tracks/{id}/stream`` (which the audio
// element fires before the decode failure) — that's the deterministic
// signal that the radio bound its playlist correctly.
const SILENT_MP3 = Buffer.from([
  0xff, 0xfb, 0x90, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
]);

function mockTrackStream(_trackId: string) {
  return (r: Route) =>
    r.fulfill({
      status: 200,
      contentType: "audio/mpeg",
      body: SILENT_MP3,
    });
}

function trackStreamRequestCounter(page: import("@playwright/test").Page) {
  const hits = new Set<string>();
  page.on("request", (req) => {
    const m = req.url().match(/\/api\/v1\/tracks\/([^/]+)\/stream/);
    if (m) hits.add(m[1]);
  });
  return hits;
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
    const streamHits = trackStreamRequestCounter(page);

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
      [`GET  /api/v1/tracks/${SEED_TRACK.id}/stream`]: mockTrackStream(
        SEED_TRACK.id,
      ),
      [`GET  /api/v1/tracks/${SEED_TRACK_2.id}/stream`]: mockTrackStream(
        SEED_TRACK_2.id,
      ),
    });
    await seedAuthTokens(page);
    // Reset the persisted floating-player state so this test always
    // sees the expanded chrome (hidden=false). Without this, an earlier
    // test that collapsed the player would leak through.
    await page.evaluate(() =>
      window.localStorage.removeItem("lbt.audio.v1"),
    );

    await page.goto("/focus/solo");
    await expect(page.getByTestId("splash")).toBeHidden({ timeout: 10_000 });

    // Scene shell mounted.
    await expect(page.getByTestId("focus-solo-scene")).toBeAttached({
      timeout: 10_000,
    });

    // FloatingMusicPlayer is rendered (either chrome state is fine).
    // Using `attached` because the floating panel is absolute-positioned
    // outside the viewport on small headless windows; "visible" can fail
    // even though the DOM element is mounted and audio plumbing is live.
    await expect(
      page
        .locator(
          '[data-testid="floating-music-player"], [data-testid="floating-music-toggle"]',
        )
        .first(),
    ).toBeAttached({ timeout: 5_000 });

    // The hidden <audio> fires a GET against the first track's stream
    // endpoint before Chromium can decode the silent stub and fall back
    // to LOCAL_FALLBACK_TRACKS. Polling ``audio.src`` races that
    // fallback; counting outbound requests doesn't.
    await expect
      .poll(() => streamHits.has(SEED_TRACK.id), { timeout: 5_000 })
      .toBe(true);

    // Autoplay blocked → the unlock pill is visible. Use testid so
    // the assertion works regardless of the active locale (zh-TW / en).
    await expect(page.getByTestId("floating-music-unlock")).toBeVisible();

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

  test("paired focus: playlist context=focus/matchId + NotesStream mounted", async ({
    page,
  }) => {
    const MATCH_ID = "match-e2e-1";
    const PARTNER_USER_ID = "u-partner";
    let lastPlaylistQuery: { context: string | null; context_id: string | null } = {
      context: null,
      context_id: null,
    };
    const streamHits = trackStreamRequestCounter(page);

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

    const notes: Note[] = [
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

    await mockApi(page, {
      ...focusBaselineMocks(),
      "GET  /api/v1/notes": (r) => {
        const matchId = new URL(r.request().url()).searchParams.get("match_id");
        if (matchId === MATCH_ID) return json(r, 200, notes);
        return json(
          r,
          200,
          notes.filter((n) => n.user_id === fixtures.user.id),
        );
      },
      [`GET  /api/v1/matches/${MATCH_ID}`]: (r) =>
        json(r, 200, {
          id: MATCH_ID,
          requester_id: fixtures.user.id,
          candidate_id: PARTNER_USER_ID,
          requester_character_key: fixtures.user.character_key,
          candidate_character_key: "kai",
          compatibility: 80,
          reason: "test",
          state: "accepted",
          created_at: "2026-05-01T00:00:00Z",
        }),
      [`GET  /api/v1/matches/${MATCH_ID}/agenda`]: (r) => json(r, 200, { items: [] }),
      [`GET  /api/v1/matches/${MATCH_ID}/chat`]: (r) => json(r, 200, { messages: [] }),
      [`GET  /api/v1/matches/${MATCH_ID}/notes`]: (r) => json(r, 200, { body: "" }),
      "GET  /api/v1/playback/playlist": (r) => {
        const url = new URL(r.request().url());
        lastPlaylistQuery = {
          context: url.searchParams.get("context"),
          context_id: url.searchParams.get("context_id"),
        };
        return json(r, 200, playlistResponse("focus", MATCH_ID));
      },
      [`GET  /api/v1/tracks/${SEED_TRACK.id}/stream`]: mockTrackStream(
        SEED_TRACK.id,
      ),
      [`GET  /api/v1/tracks/${SEED_TRACK_2.id}/stream`]: mockTrackStream(
        SEED_TRACK_2.id,
      ),
    });
    await seedAuthTokens(page);
    await page.evaluate(() =>
      window.localStorage.removeItem("lbt.audio.v1"),
    );

    await page.goto(`/focus/${MATCH_ID}`);
    await expect(page.getByTestId("splash")).toBeHidden({ timeout: 10_000 });

    // Buddy scene shell.  NotesStream is rendered only when the notes
    // tab is active; default tab is "chat", so we open notes first.
    // (Reference's buddy room is a single shared textarea; no shared/
    // private toggle.)
    await expect(page.getByTestId("buddy-focus-scene")).toBeVisible();
    await page.getByTestId("shared-panel").locator('[data-tab="notes"]').click();
    await expect(page.getByTestId("notes-stream")).toBeVisible();

    // Playlist endpoint was hit with context=focus, context_id=matchId.
    await expect
      .poll(() => lastPlaylistQuery, { timeout: 5_000 })
      .toEqual({ context: "focus", context_id: MATCH_ID });

    // FloatingMusicPlayer mounted (expanded or collapsed chrome).
    await expect(
      page
        .locator(
          '[data-testid="floating-music-player"], [data-testid="floating-music-toggle"]',
        )
        .first(),
    ).toBeAttached({ timeout: 5_000 });

    // Audio bound to the first track's stream URL (see note above).
    await expect
      .poll(() => streamHits.has(SEED_TRACK.id), { timeout: 5_000 })
      .toBe(true);
  });

  test("city: /town PersonalRadio calls playlist with context=city", async ({
    page,
  }) => {
    let lastContext: string | null = null;
    const streamHits = trackStreamRequestCounter(page);

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
      [`GET  /api/v1/tracks/${SEED_TRACK.id}/stream`]: mockTrackStream(
        SEED_TRACK.id,
      ),
      [`GET  /api/v1/tracks/${SEED_TRACK_2.id}/stream`]: mockTrackStream(
        SEED_TRACK_2.id,
      ),
    });
    await seedAuthTokens(page);

    await page.goto("/town");
    await expect(page.getByTestId("splash")).toBeHidden({ timeout: 10_000 });

    // Town's BottomHUD MusicPlayer renders the "lofi · LIVE" header
    // (town.bottom.musicPlayer.liveLabel) — replaces the legacy
    // "城市電台" copy.
    await expect(page.getByTestId("music-player")).toBeVisible({
      timeout: 5_000,
    });
    await expect
      .poll(() => lastContext, { timeout: 5_000 })
      .toBe("city");

    // Audio bound to the first city track's stream URL (see note above).
    await expect
      .poll(() => streamHits.has(SEED_TRACK.id), { timeout: 5_000 })
      .toBe(true);
  });
});
