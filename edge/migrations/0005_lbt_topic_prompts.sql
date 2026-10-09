-- Sky topics as questions: yesterday's trending keyword stays in `word`
-- (dedupe and the admin view); `prompt` holds the light, open question the
-- home shows instead ("颱風假" -> "颱風假你都怎麼過？"), written by the daily
-- cron with Workers AI. NULL = show the word as it is (owner picks, or a
-- day the rewrite was unavailable).
ALTER TABLE lbt_topics ADD COLUMN prompt TEXT;
