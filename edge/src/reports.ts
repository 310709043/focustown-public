/** D1 adapter for safety reports (table in migrations/0001_lbt_reports.sql). */
import type { ReportRecord } from "./town";

export const REPORT_STATUSES = ["open", "reviewed", "actioned", "dismissed"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

interface Row {
  id: string;
  conversation_id: string;
  reporter_guest_id: string;
  reported_guest_id: string;
  reason: string;
  note: string | null;
  transcript: string;
  reporter_profile: string;
  reported_profile: string;
  status: string;
  created_at: string;
}

export async function saveReport(db: D1Database, r: ReportRecord): Promise<void> {
  await db
    .prepare(
      `INSERT INTO lbt_reports (id, conversation_id, reporter_guest_id, reported_guest_id, reason, note,
         transcript, reporter_profile, reported_profile, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      r.id,
      r.conversationId,
      r.reporterGuestId,
      r.reportedGuestId,
      r.reason,
      r.note,
      JSON.stringify(r.transcript),
      JSON.stringify(r.reporterProfile),
      JSON.stringify(r.reportedProfile),
      r.status,
      r.createdAt,
    )
    .run();
}

export async function listReports(db: D1Database, status: ReportStatus | null, limit: number) {
  const select = `SELECT r.*, b.report_id AS suspension_report_id, b.expires_at AS suspension_expires_at,
    b.reason AS suspension_reason,
    (SELECT json_group_array(json_object('action', a.action, 'reason', a.reason, 'status', a.status,
      'expires_at', a.expires_at, 'created_at', a.created_at, 'actor', a.actor))
     FROM (SELECT * FROM lbt_moderation_actions WHERE report_id = r.id ORDER BY created_at DESC, rowid DESC LIMIT 50) a) AS actions
    FROM lbt_reports r LEFT JOIN lbt_suspensions b ON b.guest_id = r.reported_guest_id AND b.expires_at > ?`;
  const now = new Date().toISOString();
  const stmt = status
    ? db.prepare(select + " WHERE r.status = ? ORDER BY r.created_at DESC LIMIT ?").bind(now, status, limit)
    : db.prepare(select + " ORDER BY r.created_at DESC LIMIT ?").bind(now, limit);
  const { results } = await stmt.all<Row & {actions: string; suspension_report_id: string | null; suspension_expires_at: string | null; suspension_reason: string | null}>();
  return results.map((row) => ({
    ...row,
    actions: JSON.parse(row.actions || "[]") as unknown,
    transcript: JSON.parse(row.transcript) as unknown,
    reporter_profile: JSON.parse(row.reporter_profile) as unknown,
    reported_profile: JSON.parse(row.reported_profile) as unknown,
  }));
}

export async function setReportStatus(db: D1Database, id: string, status: ReportStatus): Promise<boolean> {
  const found = await db.prepare("SELECT id FROM lbt_reports WHERE id = ?").bind(id).first();
  if (!found) return false;
  await db.batch([
    db.prepare("UPDATE lbt_reports SET status = ? WHERE id = ?").bind(status, id),
    db.prepare("INSERT INTO lbt_moderation_actions (id, report_id, action, reason, status, created_at) VALUES (?, ?, 'status', '', ?, ?)")
      .bind(crypto.randomUUID(), id, status, new Date().toISOString()),
  ]);
  return true;
}

/** Delete reports created before `cutoffIso`; returns how many. */
export async function purgeReports(db: D1Database, cutoffIso: string): Promise<number> {
  const res = await db.prepare("DELETE FROM lbt_reports WHERE created_at < ?").bind(cutoffIso).run();
  return res.meta.changes ?? 0;
}

/** Report counts per status, plus how many arrived since `sinceIso`. */
export async function reportCounts(db: D1Database, sinceIso: string) {
  const { results } = await db
    .prepare("SELECT status, COUNT(*) AS n FROM lbt_reports GROUP BY status")
    .all<{ status: string; n: number }>();
  const byStatus = Object.fromEntries(REPORT_STATUSES.map((s) => [s, 0])) as Record<ReportStatus, number>;
  for (const row of results) {
    if ((REPORT_STATUSES as readonly string[]).includes(row.status)) byStatus[row.status as ReportStatus] = row.n;
  }
  const recent = await db
    .prepare("SELECT COUNT(*) AS n FROM lbt_reports WHERE created_at >= ?")
    .bind(sinceIso)
    .first<{ n: number }>();
  return { byStatus, last24h: recent?.n ?? 0 };
}
