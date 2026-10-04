-- Feedback box ("意見箱"; mirrors backend migration 0033). Anonymous unless
-- the sender leaves an e-mail. Purged after LBT_FEEDBACK_RETENTION_DAYS by
-- the daily cron in src/index.ts.
CREATE TABLE IF NOT EXISTS lbt_feedback (
  id          TEXT PRIMARY KEY,
  category    TEXT NOT NULL,            -- idea | bug | other
  message     TEXT NOT NULL,
  email       TEXT,
  page        TEXT,
  locale      TEXT,
  status      TEXT NOT NULL DEFAULT 'new',  -- new | read | done
  sheet_sent  INTEGER NOT NULL DEFAULT 0,   -- 1 once the Google Sheet accepted it
  created_at  TEXT NOT NULL             -- ISO 8601 UTC
);
CREATE INDEX IF NOT EXISTS ix_lbt_feedback_status_created ON lbt_feedback (status, created_at);
CREATE INDEX IF NOT EXISTS ix_lbt_feedback_created ON lbt_feedback (created_at);
