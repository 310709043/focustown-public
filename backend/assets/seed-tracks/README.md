# Seed tracks (V1: official-only library)

Drop royalty-free MP3 files into this directory and run
`python scripts/seed-dev-data.py` (or `docker compose exec backend python
/app/../scripts/seed-dev-data.py`) to publish them as the V1 official
library.

V1 ships **no user upload path**: every track in production is one of
these seeded files, owned by the hidden system user
`seed-system@lowbatterytown.local` (`is_active=False`). When the upload
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

- **The 5 MP3s in this directory ARE committed** (Phase 2 Gap 1 closure,
  2026-05-20) — they are 10-second 64kbps sine-wave placeholders so a
  fresh `docker compose up --build` doesn't leave the music library
  silent. Each is ~80 KB; total ~400 KB. Pitches were chosen for variety:
  E4 (330 Hz) / A4 (440 Hz) / F♯4 (370 Hz) / G4 (392 Hz) / C5 (523 Hz),
  with 0.5 s fade in + fade out and -12 dB headroom so they don't
  surprise on autoplay.
- The `.gitignore` blanket-ignores `*.mp3` everywhere else; these 5
  filenames are excepted via `!backend/assets/seed-tracks/<name>.mp3`
  entries so additional MP3s dropped here would still need a force-add
  or an `.gitignore` update.
- **Before public launch**: replace each file with a real CC0-licensed
  lofi clip of the matching mood. The filename → mood mapping in
  `SEED_TRACK_MOOD_BY_FILENAME` is the contract; the audio content is
  free-form.
- The seeder is idempotent: re-running it skips tracks whose titles
  already exist (matched by `_seed_title(filename)`).
- Changing a track's mood after seeding requires updating the DB row
  directly; the seeder won't overwrite existing rows.
- Works under both `STORAGE_BACKEND=local` (writes to `storage_root`)
  and `STORAGE_BACKEND=s3` (PUTs to the MinIO bucket).
