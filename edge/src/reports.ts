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
  const stmt = status
    ? db.prepare("SELECT * FROM lbt_reports WHERE status = ? ORDER BY created_at DESC LIMIT ?").bind(status, limit)
    : db.prepare("SELECT * FROM lbt_reports ORDER BY created_at DESC LIMIT ?").bind(limit);
  const { results } = await stmt.all<Row>();
  return results.map((row) => ({
    ...row,
    transcript: JSON.parse(row.transcript) as unknown,
    reporter_profile: JSON.parse(row.reporter_profile) as unknown,
    reported_profile: JSON.parse(row.reported_profile) as unknown,
  }));
}

export async function setReportStatus(db: D1Database, id: string, status: ReportStatus): Promise<boolean> {
  const res = await db.prepare("UPDATE lbt_reports SET status = ? WHERE id = ?").bind(status, id).run();
  return (res.meta.changes ?? 0) > 0;
}

/** Delete reports created before `cutoffIso`; returns how many. */
export async function purgeReports(db: D1Database, cutoffIso: string): Promise<number> {
  const res = await db.prepare("DELETE FROM lbt_reports WHERE created_at < ?").bind(cutoffIso).run();
  return res.meta.changes ?? 0;
}
