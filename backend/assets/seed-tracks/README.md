# Seed tracks (V1: official-only library)

Drop royalty-free MP3 files into this directory and run
`python scripts/seed-dev-data.py` (or `docker compose exec backend python
/app/../scripts/seed-dev-data.py`) to publish them as the V1 official
library.

V1 ships **no user upload path**: every track in production is one of
these seeded files, owned by the hidden system user
`seed-system@focustown.local` (`is_active=False`). When the upload
pipeline is re-opened later, this directory keeps the same role for
curated officials.

## Recognised filenames

The seed script reads `SEED_TRACK_MOOD_BY_FILENAME` in
`scripts/seed-dev-data.py` to set title and mood per filename. Files not
listed there still get seeded — they default to `mood=lofi` and a title
derived from the filename — but explicit entries are preferred for the
curated set:

| Filename | Title | Mood |
|---|---|---|
| `cold-ceramics.mp3` | Cold Ceramics | ambient |
| `sunlight-on-the-floor.mp3` | Sunlight on the Floor | lofi |
| `cold-windowpane.mp3` | Cold Windowpane | ambient |
| `midnight-at-the-overpass.mp3` | Midnight at the Overpass | jazz |
| `sunday-window.mp3` | Sunday Window | lofi |

## Notes

- This directory's MP3 files are **gitignored** — real audio is not
  shipped in the repo. Each developer drops their own copies in.
- The seeder is idempotent: re-running it skips tracks whose titles
  already exist (matched by `_seed_title(filename)`).
- Changing a track's mood after seeding requires updating the DB row
  directly; the seeder won't overwrite existing rows.
- Works under both `STORAGE_BACKEND=local` (writes to `storage_root`)
  and `STORAGE_BACKEND=s3` (PUTs to the MinIO bucket).
