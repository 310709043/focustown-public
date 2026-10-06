-- Aggregate daily usage counts for the admin traffic/usage view.
--
-- No PII: a single running count of conversations started per UTC day.
-- Reports and feedback per day are derived from their own tables at query
-- time (src/dailyStats.ts), so they are not duplicated here. Rows are tiny
-- (one short row per day) and kept indefinitely — a usage trend is not
-- user content, so it is outside the report/feedback retention windows.
CREATE TABLE IF NOT EXISTS lbt_daily_stats (
  date          TEXT PRIMARY KEY,          -- YYYY-MM-DD (UTC)
  conversations INTEGER NOT NULL DEFAULT 0 -- conversations started that day
);
