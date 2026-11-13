-- Last known state of each uptime probe (src/uptime.ts), so the owner is
-- alerted when a check starts failing and when it recovers, not every run.
CREATE TABLE IF NOT EXISTS lbt_uptime (
  name TEXT PRIMARY KEY,
  ok INTEGER NOT NULL CHECK (ok IN (0, 1)),
  since TEXT NOT NULL,
  alerted_at TEXT
);
