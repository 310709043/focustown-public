# V1 Handoff TODO

V1 release is feature-complete **except for payment top-up** and **two small gaps documented below**. This file is the pickup point for whoever continues on another machine.

Branch: `chore/v1-handoff-todo` (this PR).
Last `develop` commit reviewed: `ffc9007 feat(buddy): persistent chat + shared agenda with realtime fan-out`.

---

## V1 status snapshot

### ✅ Complete and pushed to `develop`

| Area | Commit | Notes |
|---|---|---|
| Rebrand to Low Battery Town + T-coin wallet panel | `2a9efac` | Wide LBT logo, removed FOCUSTOWN wordmark, T幣錢包 view |
| Signin upper-section polish (signin.jpg) | `ea912a4`, `e6452e0`, `66a41f7` | Amber CTA, AboutTown rotating tip carousel (4 tips), full i18n |
| Notes view wired to `/api/v1/notes` | `4769610` | ProfileModal Notes tab replaces stub |
| Feedback submission (backend + FE) | `dc1bc0a` | `feedback_submissions` table, rate-limited, FeedbackModal form |
| Wallet writes — redeem + gift | `65c7457` | `redemption_codes`, `redemption_code_uses`, `wallet_transactions.metadata` |
| Friends — CRUD + focusing-now + WS events | `701760e` | `friendships` low/high pair invariant; real FriendsNow data |
| User preferences + Settings + SoundMixer persist | `6ead442` | `user_preferences` JSONB bag; debounced PATCH on slider change |
| SupportView FAQ | `a24a22e` | i18n-driven accordion replaces stub |
| Buddy realtime — persistent chat + shared agenda | `ffc9007` | `match_messages`, `match_agenda_items`, Redis pub/sub fan-out |
| Auto-match real-user-first | (pre-existing) | Presence-gated real pool exhausted before bot fallback. Tested in `tests/integration/api/test_matches_auto_router.py:66-101`. |
| Music stream backend | (pre-existing) | `/api/v1/tracks/{id}/stream` returns audio bytes with HTTP-206 range; S3 fallback ready |
| Personalized radio shuffle | (pre-existing) | Deterministic per (user, context, day); `useRadioPlaylist` consumes it |

### 🚫 Out of scope for v1 (explicit user exclusion)

- **Wallet 儲值 (top-up via payment provider)** — needs merchant accounts (VISA / MC / JCB / Apple Pay / Google Pay / LINE Pay), webhook receiver with signature verification, idempotency on provider callbacks, KYC for LINE Pay. Multi-day engineering + legal coordination. UI is a `coming soon` toast.

### ⚠ Gap 1 — Music goes silent on a fresh deploy

**What works:** every line of code from `<audio>` element to S3 stream is wired.

**What doesn't work:** the seeded track catalog is empty because there are no MP3 files in the repo.

- `scripts/seed-dev-data.py:86-92` expects these filenames in `backend/assets/seed-tracks/`:
  - `cold-ceramics.mp3` (ambient)
  - `sunlight-on-the-floor.mp3` (lofi)
  - `cold-windowpane.mp3` (ambient)
  - `midnight-at-the-overpass.mp3` (jazz)
  - `sunday-window.mp3` (lofi)
- When the catalog is empty, `frontend/lib/hooks/useRadioPlaylist.ts:30-55` falls back to `LOCAL_FALLBACK_TRACKS` which reference `/audio/lofi-1.mp3` through `/audio/lofi-3.mp3` — those files don't exist in `frontend/public/audio/` either. Net result: silence.

**Fix (recommended A3 — smallest):**
1. Drop one CC0-licensed placeholder MP3 at `frontend/public/audio/lofi-1.mp3` (and ideally `lofi-2.mp3`, `lofi-3.mp3` matching the three fallback entries). License attribution comment in a `frontend/public/audio/README.md`.
2. Add `backend/assets/seed-tracks/README.md` documenting the expected filenames and that `scripts/seed-dev-data.py` will auto-insert any present files.

**Fix (A1 — ops path for prod):**
- Drop the 5 expected MP3s into `backend/assets/seed-tracks/`, run `docker compose exec backend python /app/../scripts/seed-dev-data.py` once. After that the radio plays real tracks.

LOC estimate: 0 code lines (just binaries + 1 short README), or a few lines if we also want the fallback list to gracefully empty itself when no audio files exist.

### ⚠ Gap 2 — Visitors in someone else's room don't hear the owner's music

**What works:**
- `RoomPlaybackService` (backend) publishes `music.play`, `music.pause`, `music.change` to `room:{id}` on every state change.
- The Redis pub/sub bridge already fans these out to connected WebSockets in the room.

**What doesn't work:**
- `frontend/app/[locale]/town/room/[id]/page.tsx:271-281` explicitly comments "deliberately NOT synchronized" and renders the visitor's personal radio instead.
- No `useRealtime` subscription on `music.*` event types for the visitor view.

**Fix (~150 LOC, FE-only, 0 migrations):**
1. New `frontend/lib/state/roomPlaybackStore.ts` (zustand): holds `{ track_id, started_at_ms, paused_at_ms, is_playing }` for the currently viewed room. Updates via WS event handler.
2. Update `/town/room/[id]/page.tsx`:
   - On mount, `GET /api/v1/rooms/{id}/playback` to seed initial state.
   - Subscribe via `useRealtime` to `music.play` / `music.pause` / `music.change` filtered by `room_id === currentRoomId`. Mutate store on each event.
3. Add a second hidden `<audio>` element pinned to the store. Drift correction: compute `currentTime = (now - started_at_ms) / 1000`; reseek on `music.change`.
4. Reuse the existing `tracksApi.streamUrl(id)` for the `src`.

References:
- WS event names: `frontend/lib/ws/client.ts:46-62`
- Backend publisher: `backend/app/domain/services/room_playback_service.py:106-114` (play), `:136-143` (pause), `:162-170` (change)
- Existing `useRealtime` patterns: `frontend/lib/ws/useRealtimeMatch.ts`, `frontend/components/focus-buddy/ChatStream.tsx:84-117` (good example of filtering events by id)

---

## How to pick up on the other machine

```bash
git clone git@github.com:CoreNovus/focustown.git
cd focustown
git fetch origin
git checkout chore/v1-handoff-todo

# Backend
cd backend && pip install -e ".[dev]" && alembic upgrade head
# (Optional) drop MP3s into assets/seed-tracks/ then:
python ../scripts/seed-dev-data.py

# Frontend
cd ../frontend && pnpm install
pnpm typecheck && pnpm lint && pnpm build  # should all be green

# Pick a task:
# 1. Close Gap 1 (music seed) — 30 min
# 2. Close Gap 2 (room playback sync) — half day
# 3. Start Phase P8 (payment top-up integration) — multi-day
```

### Suggested next branches

- `feat/music-placeholder-tracks` — Gap 1
- `feat/room-playback-sync` — Gap 2
- `feat/wallet-topup-stripe` (or `linepay`) — Phase P8

---

## Architecture invariants (don't break)

These rules are enforced by the existing code; review before touching:

1. **Hexagonal layering**: services in `app/domain/services/` depend only on Protocols in `app/domain/repositories/`. Never import `sqlalchemy` or `fastapi` inside `app/domain/`. New repos: Protocol first, then `SqlFooRepo` adapter in `app/infrastructure/db/repositories/`.
2. **Realtime fan-out**: anything multi-user goes through `IRealtimePublisher.publish(channel, payload)`. The WS bridge picks it up. Never call `WSManager` directly.
3. **Idempotency on writes**: use either a domain-natural UNIQUE constraint (e.g. `(code_id, user_id)` for redemption uses) or an Idempotency-Key header. Translates SQL `IntegrityError` → domain `IdempotencyViolationError` at the repo boundary.
4. **JSONB only when shape is per-key heterogeneous**: preferences, transaction metadata, feedback context. Plain index on `(user_id, key)`; no GIN unless we actually query inside the JSONB.
5. **CLAUDE.md is canonical**: read `CLAUDE.md` at repo root + `.claude/rules/*.md` before non-trivial work.

---

## Open question for whoever picks this up

Before Phase P8 (payment top-up), pick a single provider first. Recommendation:
- **Stripe** (cards + Apple Pay + Google Pay in one integration, dev-grade webhook + SDK).
- **LINE Pay** later for TWD coverage (KYC + merchant approval lead time).

Cross-reference the proposed schema in the prior plan section on Phase P8.
