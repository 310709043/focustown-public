-- Temporary anonymous-code restrictions and append-only report review history.
CREATE TABLE IF NOT EXISTS lbt_suspensions (
  guest_id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES lbt_reports(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_lbt_suspensions_expiry ON lbt_suspensions(expires_at);
CREATE TABLE IF NOT EXISTS lbt_moderation_actions (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES lbt_reports(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK(action IN ('suspend','revoke','status')),
  reason TEXT NOT NULL,
  status TEXT NOT NULL,
  expires_at TEXT,
  created_at TEXT NOT NULL,
  actor TEXT NOT NULL DEFAULT 'admin'
);
CREATE INDEX IF NOT EXISTS ix_lbt_moderation_report ON lbt_moderation_actions(report_id, created_at);
