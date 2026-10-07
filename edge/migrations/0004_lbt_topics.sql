-- Sky topics shown on the home stage (balloon / plane / kite / neon sign).
--
-- "trends": public daily search trends for Taiwan (Google Trends RSS),
-- fetched by the daily cron and filtered for distressing words.
-- "manual": words the owner adds in /admin (e.g. from Threads).
-- No user content and no PII: only short public keywords.
CREATE TABLE IF NOT EXISTS lbt_topics (
  id         TEXT PRIMARY KEY,
  word       TEXT NOT NULL,
  source     TEXT NOT NULL CHECK (source IN ('trends', 'manual')),
  day        TEXT NOT NULL,              -- YYYY-MM-DD (Asia/Taipei) it was fetched or added
  hidden     INTEGER NOT NULL DEFAULT 0, -- 1 = the owner hid it
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS lbt_topics_word_day ON lbt_topics (source, day, word);
