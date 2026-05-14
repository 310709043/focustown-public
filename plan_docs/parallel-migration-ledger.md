# Parallel Alembic Migration Ledger

Authoritative rev_id assignments while two lanes (`focustown-lane-a` and
`focustown-lane-b`) ship phases in parallel. Both lanes consult this file
before running `alembic revision` so that the two histories merge cleanly.

**Current head (origin/main):** `0010_room_visit` (post Lane A Wave 3
merge, PR #14). `feat/p9-sync-playback` (this branch) stages
`0011_room_playback` — the final Lane A migration.

## Rules

1. Every new migration is created with explicit `--rev-id`. Never use
   `--autogenerate` — it re-checks the model graph mid-flight and races
   the other lane.
2. When two lanes target the same wave, the **second to ship** rebases
   `down_revision` (NOT `revision`) to chain off the first.
3. Slot order in the table below is the *intended* merge order. If reality
   diverges (e.g. Lane B Wave 2 lands before Lane A Wave 2), the slot
   numbers stay; only the `down_revision` of the later PR shifts.

## Allocations

| Rev    | Slug                      | Owner Lane / Wave              | Pre-rebase `down_revision`             |
| ------ | ------------------------- | ------------------------------ | -------------------------------------- |
| `0006` | `achievements_seed`       | Lane B / Wave 1 (data)         | `0005`                                 |
| `0007` | `leaderboard_snapshots`   | Lane B / Wave 1 (schema)       | `0006`                                 |
| `0008` | `room_items`              | Lane A / Wave 2 (Phase 5)      | `0007`                                 |
| `0009` | `room_tracks`             | Lane B / Wave 2 (Phase 7)      | `0007` → rebase to `0008` if Lane A ships first |
| `0010` | `room_visit`              | Lane A / Wave 3 (Phase 8)      | (rebase to latest head)                |
| `0011` | `room_playback`           | Lane A / Wave 4 (Phase 9)      | (rebase to latest head)                |

> The shift from the planner's original table (which used `0006` only for
> `achievements_seed`) reflects a real schema requirement discovered while
> implementing Lane B Wave 1: the daily worker leaderboard snapshot needs
> its own destination table. Wave 2+ rev_ids therefore all shift by +1.

## Command convention

```bash
cd backend
alembic revision -m "<slug>" --rev-id 00XX
```

Open the generated file and:
- Set `down_revision` per the table above.
- Hand-write `upgrade()` / `downgrade()` (no `op.add_column` autogen guesswork).
- Always pair a reversible `downgrade()` with each `upgrade()` so
  `alembic downgrade -1 && alembic upgrade head` is clean in CI.

## Rebase recipe (second-shipper)

When the other lane in your wave merges first:

1. `git fetch origin && git rebase origin/main`
2. Open your new migration file. Change `down_revision = "00XX"` to point
   at the rev_id that the other lane just merged.
3. Do **not** change your `revision = "00YY"` line — that ID is reserved
   for you in this ledger.
4. Run `alembic upgrade head` locally to confirm the chain resolves to a
   single tip. If it doesn't, you have a real conflict (two migrations
   touching the same column / constraint name) — resolve before pushing.

## When this ledger changes

Update this file in the same PR that bumps the planner's main plan or
introduces a new wave. Any rev_id allocation outside this table is a bug.
