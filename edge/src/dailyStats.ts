/**
 * Daily usage trend for the admin console. Aggregate and PII-free: a running
 * count of conversations started per day (stored in `lbt_daily_stats`), merged
 * at read time with reports and feedback counts derived from their own tables.
 *
 * Everything is bucketed by UTC day so the three series line up; the admin
 * console labels the view accordingly.
 */

function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10); // YYYY-MM-DD
}

/** +1 to today's conversation count. Called whenever a conversation starts. */
export async function recordConversation(db: D1Database, nowMs: number): Promise<void> {
  await db
    .prepare(
      `INSERT INTO lbt_daily_stats (date, conversations) VALUES (?, 1)
       ON CONFLICT(date) DO UPDATE SET conversations = conversations + 1`,
    )
    .bind(utcDay(nowMs))
    .run();
}

export interface DailyTrend {
  date: string;
  conversations: number;
  reports: number;
  feedback: number;
}

/**
 * One row per day for the last `days` (clamped 1..90), most recent last, with
 * no gaps. Conversations come from `lbt_daily_stats`; reports and feedback are
 * counted from their live tables (both within retention for a 30-day window).
 */
export async function listDailyTrends(db: D1Database, nowMs: number, days: number): Promise<DailyTrend[]> {
  const span = Math.min(90, Math.max(1, Math.floor(days) || 30));
  const since = utcDay(nowMs - (span - 1) * 86_400_000);
  const [convos, reports, feedback] = await Promise.all([
    db.prepare(`SELECT date, conversations AS n FROM lbt_daily_stats WHERE date >= ?`).bind(since).all(),
    db.prepare(`SELECT substr(created_at, 1, 10) AS date, COUNT(*) AS n FROM lbt_reports WHERE created_at >= ? GROUP BY date`).bind(since).all(),
    db.prepare(`SELECT substr(created_at, 1, 10) AS date, COUNT(*) AS n FROM lbt_feedback WHERE created_at >= ? GROUP BY date`).bind(since).all(),
  ]);

  const byDate = new Map<string, DailyTrend>();
  const row = (d: string): DailyTrend => {
    let r = byDate.get(d);
    if (!r) { r = { date: d, conversations: 0, reports: 0, feedback: 0 }; byDate.set(d, r); }
    return r;
  };
  for (const r of convos.results as { date: string; n: number }[]) row(r.date).conversations = r.n;
  for (const r of reports.results as { date: string; n: number }[]) row(r.date).reports = r.n;
  for (const r of feedback.results as { date: string; n: number }[]) row(r.date).feedback = r.n;

  const out: DailyTrend[] = [];
  for (let i = span - 1; i >= 0; i--) {
    const d = utcDay(nowMs - i * 86_400_000);
    out.push(byDate.get(d) ?? { date: d, conversations: 0, reports: 0, feedback: 0 });
  }
  return out;
}
