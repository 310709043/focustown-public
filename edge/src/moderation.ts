/** Reviewed, time-limited restrictions on anonymous guest codes; no device tracking. */
import { cleanText, InputError } from "./rules";

export interface Suspension {
  guest_id: string;
  report_id: string;
  reason: string;
  expires_at: string;
  created_at: string;
}

export async function activeSuspensions(db: D1Database, now: number): Promise<Suspension[]> {
  const { results } = await db.prepare("SELECT * FROM lbt_suspensions WHERE expires_at > ?")
    .bind(new Date(now).toISOString()).all<Suspension>();
  return results;
}

export async function moderateReport(db: D1Database, reportId: string, raw: unknown, now: number, retentionDays = 180) {
  const body = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  if (body.action !== "suspend" && body.action !== "revoke") throw new InputError("invalid_moderation_action");
  if (typeof body.reason !== "string" || Array.from(body.reason.trim()).length > 500) throw new InputError("invalid_moderation_reason");
  const reason = cleanText(body.reason, 500);
  if (!reason) throw new InputError("invalid_moderation_reason");
  if (body.action === "suspend" && body.days !== 1 && body.days !== 7) throw new InputError("invalid_moderation_duration");
  const report = await db.prepare("SELECT reported_guest_id, created_at FROM lbt_reports WHERE id = ?").bind(reportId)
    .first<{ reported_guest_id: string; created_at: string }>();
  if (!report) throw new InputError("report_not_found");
  const current = await db.prepare("SELECT * FROM lbt_suspensions WHERE guest_id = ?")
    .bind(report.reported_guest_id).first<Suspension>();
  const at = new Date(now).toISOString();
  const active = current && current.expires_at > at;
  if (body.action === "revoke" && (!active || current.report_id !== reportId)) throw new InputError("no_active_suspension");
  // A new review can extend a restriction, never silently shorten an existing one.
  const expires = body.action === "suspend"
    ? new Date(Math.max(now + Number(body.days) * 86_400_000, active ? Date.parse(current.expires_at) : 0)).toISOString()
    : null;
  if (expires && Date.parse(expires) > Date.parse(report.created_at) + retentionDays * 86_400_000) throw new InputError("report_expires_too_soon");
  const change = body.action === "suspend"
    ? db.prepare(`INSERT INTO lbt_suspensions (guest_id, report_id, reason, expires_at, created_at) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(guest_id) DO UPDATE SET report_id=excluded.report_id, reason=excluded.reason,
        expires_at=excluded.expires_at, created_at=excluded.created_at`)
      .bind(report.reported_guest_id, reportId, reason, expires, at)
    : db.prepare("DELETE FROM lbt_suspensions WHERE guest_id = ? AND report_id = ?").bind(report.reported_guest_id, reportId);
  await db.batch([
    change,
    db.prepare("INSERT INTO lbt_moderation_actions (id, report_id, action, reason, status, expires_at, created_at) VALUES (?, ?, ?, ?, 'actioned', ?, ?)")
      .bind(crypto.randomUUID(), reportId, body.action, reason, expires, at),
    db.prepare("UPDATE lbt_reports SET status = 'actioned' WHERE id = ?").bind(reportId),
  ]);
  return { guestId: report.reported_guest_id, action: body.action, expiresAt: expires };
}

export async function purgeExpiredSuspensions(db: D1Database, now: number) {
  await db.prepare("DELETE FROM lbt_suspensions WHERE expires_at <= ?").bind(new Date(now).toISOString()).run();
}
