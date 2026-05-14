# Phase 7 — Per-Room Playlist (`room_tracks`)

> Built on Phase 4 (room model) and Phase 6 (global track library). Lays
> the persistence layer that Phase 9 (multi-player synced playback) will
> read from. Visitor-side reads land in Phase 8 (visit/leave + room WS).

## Status

- **Branch**: `feat/p7-room-tracks` (Lane B, Wave 2)
- **Parallel-with**: `feat/p5-decoration` (Lane A, Phase 5) — both lanes append to `backend/app/api/v1/rooms/router.py`
- **Roadmap source**: `plan_docs/00-roadmap.md` Phase 7 + main plan §排程
- **Alembic rev**: `0009_room_tracks` (per `plan_docs/parallel-migration-ledger.md`); pre-rebase `down_revision = "0007"`

## Scope (Tier-2 slice)

Completion checklist:

- [x] `room_tracks` table (FK rooms + FK tracks + position; UNIQUE `(room_id, track_id)`; cascade deletes)
- [x] `RoomTrackORM` + ORM `__init__` re-export
- [x] `IRoomTrackReader` + `IRoomTrackWriter` + composed `IRoomTrackRepo` Protocol (ISP-split matching `IUserReader`/`IUserWriter` from PR #8)
- [x] `SqlRoomTrackRepo` translates `IntegrityError` → `IdempotencyViolationError`
- [x] `RoomTrackService` — `list_for_user`, `add_for_user`, `remove_for_user` (owner-scoped)
- [x] `GET / POST / DELETE /api/v1/me/room/tracks` (auth required)
- [x] Response schema embeds full `TrackResponse` so frontend gets metadata in one round-trip
- [x] 8 unit tests covering happy paths + edge cases (`user_has_no_room`, `track_not_found`, `already_in_playlist`, idempotent re-add, missing-entry remove)
- [x] Frontend: `roomTracksApi.{list, add, remove}` in `lib/api/endpoints.ts`
- [x] Frontend: `/town/library` page fetches the playlist and shows per-row `+ 加入房間` / `✓ 房間` toggle
- [x] Frontend: `MusicPanel` switches data source to the owner's playlist when non-empty (with quiet `· 房間` label)

## Non-goals (deferred)

- Drag-drop **reorder** — `position` column exists but no PATCH endpoint and no UI; track order is append-only for now. Reorder is a Phase 7b polish PR.
- **Visitor read view** — `GET /rooms/{room_id}/tracks` lands in Phase 8 once visit/leave + ACL widen the room read surface beyond owner.
- **WebSocket music sync** — `music.play/pause/seek/change` events, drift correction, multi-tab playback coordination are Phase 9.
- **Audio-slot wiring** on `room/[id]/page.tsx` — that slot is reserved for Phase 9.

## Coordination with Phase 5 (Lane A)

| File | Phase 5 (Lane A) | Phase 7 (Lane B) | Resolution |
|---|---|---|---|
| `backend/alembic/versions/000X*.py` | `0008_room_items.py` | `0009_room_tracks.py` | Independent revs per ledger; second-shipper rebases `down_revision` |
| `backend/app/api/v1/rooms/router.py` | adds `/me/room/decoration` endpoints | adds `/me/room/tracks` endpoints | Append-only; both lanes keep their endpoints |
| `backend/app/api/v1/rooms/schemas.py` | decoration request/response models | playlist request/response models | Append-only |
| `backend/app/infrastructure/db/models/__init__.py` + `repositories/__init__.py` | register `RoomItemORM` / `SqlRoomItemRepo` | register `RoomTrackORM` / `SqlRoomTrackRepo` | Keep both, alphabetize on conflict |
| `frontend/lib/api/types.gen.ts` | regen for decoration types | regen for playlist types | Both regenerate post-rebase |

## File inventory

### Backend — created
- `backend/alembic/versions/20260516_0000_0009_room_tracks.py`
- `backend/app/infrastructure/db/models/room_track.py`
- `backend/app/domain/repositories/room_track_repo.py`
- `backend/app/infrastructure/db/repositories/room_track_repo.py`
- `backend/app/domain/services/room_track_service.py`
- `backend/tests/unit/test_room_track_service.py`

### Backend — edited
- `backend/app/infrastructure/db/models/__init__.py`
- `backend/app/infrastructure/db/repositories/__init__.py`
- `backend/app/api/v1/rooms/router.py`
- `backend/app/api/v1/rooms/schemas.py`
- `backend/tests/unit/fakes.py` (add `FakeRoomTrackRepo`, `FakeTrackRepo`)

### Frontend — edited
- `frontend/lib/api/types.gen.ts` (regenerated; if hand-edited locally, re-run `./scripts/gen-api-types.sh` post-merge)
- `frontend/lib/api/endpoints.ts`
- `frontend/app/town/library/page.tsx`
- `frontend/components/library/TrackList.tsx`
- `frontend/components/panels/MusicPanel.tsx`

## SOLID notes

| Principle | Holds because |
|---|---|
| SRP | `RoomTrackService` owns playlist associations only; `RoomService` owns room lifecycle (no service-on-service coupling). |
| OCP | `IRoomTrackRepo` Protocol — Redis cache / event-sourced adapters plug in without touching service. |
| LSP | `SqlRoomTrackRepo` and `FakeRoomTrackRepo` both raise `IdempotencyViolationError` on UNIQUE collision, so the fake exercises the same conflict path as the SQL adapter. |
| ISP | Reader / Writer / composed split; Phase 8 visitor view depends only on `IRoomTrackReader`. |
| DIP | Service constructor takes Protocols, never `Sql*Repo` directly; router's `_room_track_service()` is the only wiring site. |

## Verification

```bash
cd backend && ruff check . && pytest -q tests/unit && alembic upgrade head
cd ../frontend && pnpm typecheck && pnpm lint && pnpm build

# Manual smoke (docker-compose dev stack)
#   1. Sign in, visit /town/library → see global tracks
#   2. Click "+ 加入房間" on a track → button becomes "✓ 房間"; refresh page → stays
#   3. Click "✓ 房間" → reverts; row removed from /me/room/tracks
#   4. Open /town: MusicPanel header shows "🎵 音樂 · 房間" when playlist non-empty
```
