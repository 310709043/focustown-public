-- Safety reports for LowBatteryTown (mirrors backend migration 0032).
-- The only durable record the chat keeps; purged after
-- LBT_REPORT_RETENTION_DAYS by the daily cron in src/index.ts.
CREATE TABLE IF NOT EXISTS lbt_reports (
  id                TEXT PRIMARY KEY,
  conversation_id   TEXT NOT NULL,
  reporter_guest_id TEXT NOT NULL,
  reported_guest_id TEXT NOT NULL,
  reason            TEXT NOT NULL,
  note              TEXT,
  transcript        TEXT NOT NULL,  -- JSON array
  reporter_profile  TEXT NOT NULL,  -- JSON object
  reported_profile  TEXT NOT NULL,  -- JSON object
  status            TEXT NOT NULL DEFAULT 'open',
  created_at        TEXT NOT NULL   -- ISO 8601 UTC
);
CREATE INDEX IF NOT EXISTS ix_lbt_reports_status_created ON lbt_reports (status, created_at);
CREATE INDEX IF NOT EXISTS ix_lbt_reports_created ON lbt_reports (created_at);
