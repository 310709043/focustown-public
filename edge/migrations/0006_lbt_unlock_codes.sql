-- Unlock codes for paid cosmetic extras (first: the koi pond stage scene).
-- The owner generates codes in /admin and hands one to each buyer; a code
-- unlocks its item on up to `max_devices` devices. Only a SHA-256 of the
-- code is kept (codes are long random strings), plus its first four
-- characters so the owner can tell codes apart. `note` is the owner's own
-- label (e.g. where it was sold). Revoking a code (a refund) makes its
-- devices drop the item at their next check.
CREATE TABLE IF NOT EXISTS lbt_unlock_codes (
  id               TEXT PRIMARY KEY,
  code_hash        TEXT NOT NULL UNIQUE,
  hint             TEXT NOT NULL,
  item             TEXT NOT NULL,
  note             TEXT NOT NULL DEFAULT '',
  max_devices      INTEGER NOT NULL,
  redemptions      INTEGER NOT NULL DEFAULT 0,
  revoked          INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL,
  last_redeemed_at TEXT
);
