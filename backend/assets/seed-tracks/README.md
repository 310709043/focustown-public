# Seed tracks (Phase 6 Tier-2)

Drop royalty-free MP3 files into this directory to pre-populate the track
library on `python scripts/seed-dev-data.py`.

Recognised filenames (others default to mood `lofi` and a title derived from
the filename — see `SEED_TRACK_MOOD_BY_FILENAME` in the seed script):

| Filename | Mood |
|---|---|
| `midnight-city-lofi.mp3` | lofi |
| `tokyo-rain.mp3` | rain |
| `late-night-drive.mp3` | jazz |

The seeded tracks are owned by a hidden system user
(`seed-system@focustown.local`, `is_active=False`) so they can't be logged
into or deleted accidentally.

This directory is intentionally empty in git — real audio is not shipped.
Once Phase 6b lands user-upload via UI, this seeding path becomes optional.
