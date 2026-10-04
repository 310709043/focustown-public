/**
 * Feedback box ("意見箱"): validation, the D1 adapter and the forward to the
 * owner's Google Sheet (an Apps Script web app, see scripts/feedback-sheet.gs).
 * Same rules and table as the FastAPI backend's lbt feedback.
 */
import { cleanText, InputError } from "./rules";

export const FEEDBACK_MAX = 1000;
export const FEEDBACK_EMAIL_MAX = 254;
export const FEEDBACK_PAGE_MAX = 200;
export const FEEDBACK_CATEGORIES = ["idea", "bug", "other"] as const;
export const FEEDBACK_STATUSES = ["new", "read", "done"] as const;
export const FEEDBACK_LOCALES = ["zh-TW", "en"] as const;

export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export interface FeedbackInput {
  category: FeedbackCategory;
  message: string;
  email: string | null;
  page: string | null;
  locale: string | null;
}

export interface FeedbackRecord extends FeedbackInput {
  id: string;
  status: FeedbackStatus;
  createdAt: string;
}

// Deliberately loose: one @, a dot in the domain, no spaces. Delivery is the real check.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validate a submission. Returns null for the honeypot (`website` filled in by
 * a bot): the caller answers as if it worked and stores nothing.
 */
export function parseFeedback(raw: unknown): FeedbackInput | null {
  const body = (raw ?? {}) as Record<string, unknown>;
  if (typeof body.website === "string" && body.website.trim() !== "") return null;

  const category = body.category;
  if (typeof category !== "string" || !(FEEDBACK_CATEGORIES as readonly string[]).includes(category)) {
    throw new InputError("invalid_category");
  }
  if (typeof body.message !== "string" || Array.from(body.message.trim()).length > FEEDBACK_MAX) {
    throw new InputError("invalid_message");
  }
  const message = cleanText(body.message, FEEDBACK_MAX);
  if (!message) throw new InputError("invalid_message");

  let email: string | null = null;
  if (body.email !== undefined && body.email !== null && body.email !== "") {
    const value = typeof body.email === "string" ? body.email.trim() : "";
    if (value.length > FEEDBACK_EMAIL_MAX || !EMAIL.test(value)) throw new InputError("invalid_email");
    email = value;
  }

  const pageRaw = typeof body.page === "string" ? cleanText(body.page, FEEDBACK_PAGE_MAX) : "";
  const page = pageRaw.startsWith("/") ? pageRaw : null;
  const locale =
    typeof body.locale === "string" && (FEEDBACK_LOCALES as readonly string[]).includes(body.locale) ? body.locale : null;

  return { category: category as FeedbackCategory, message, email, page, locale };
}

/** Stop a spreadsheet from treating user text as a formula. */
export function sheetSafe(value: string | null): string {
  if (!value) return "";
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

interface Row {
  id: string;
  category: string;
  message: string;
  email: string | null;
  page: string | null;
  locale: string | null;
  status: string;
  sheet_sent: number;
  created_at: string;
}

export async function saveFeedback(db: D1Database, f: FeedbackRecord): Promise<void> {
  await db
    .prepare(
      `INSERT INTO lbt_feedback (id, category, message, email, page, locale, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(f.id, f.category, f.message, f.email, f.page, f.locale, f.status, f.createdAt)
    .run();
}

export async function listFeedback(db: D1Database, status: FeedbackStatus | null, limit: number) {
  const stmt = status
    ? db.prepare("SELECT * FROM lbt_feedback WHERE status = ? ORDER BY created_at DESC LIMIT ?").bind(status, limit)
    : db.prepare("SELECT * FROM lbt_feedback ORDER BY created_at DESC LIMIT ?").bind(limit);
  const { results } = await stmt.all<Row>();
  return results.map((row) => ({ ...row, sheet_sent: row.sheet_sent === 1 }));
}

export async function setFeedbackStatus(db: D1Database, id: string, status: FeedbackStatus): Promise<boolean> {
  const res = await db.prepare("UPDATE lbt_feedback SET status = ? WHERE id = ?").bind(status, id).run();
  return (res.meta.changes ?? 0) > 0;
}

export async function feedbackCounts(db: D1Database) {
  const { results } = await db
    .prepare("SELECT status, COUNT(*) AS n FROM lbt_feedback GROUP BY status")
    .all<{ status: string; n: number }>();
  const byStatus = Object.fromEntries(FEEDBACK_STATUSES.map((s) => [s, 0])) as Record<FeedbackStatus, number>;
  for (const row of results) {
    if ((FEEDBACK_STATUSES as readonly string[]).includes(row.status)) byStatus[row.status as FeedbackStatus] = row.n;
  }
  return { byStatus };
}

/** Delete feedback created before `cutoffIso`; returns how many. */
export async function purgeFeedback(db: D1Database, cutoffIso: string): Promise<number> {
  const res = await db.prepare("DELETE FROM lbt_feedback WHERE created_at < ?").bind(cutoffIso).run();
  return res.meta.changes ?? 0;
}

/**
 * Append the feedback to the owner's Google Sheet. Apps Script web apps can't
 * read request headers, so the shared token travels in the body. Never throws:
 * the D1 row is the record, the sheet is a convenience.
 *
 * Apps Script answers the POST with a 302 to script.googleusercontent.com,
 * which only serves GET; the redirect is followed by hand as a GET so it never
 * depends on how the runtime rewrites redirected POSTs.
 */
export async function forwardToSheet(
  db: D1Database,
  url: string | undefined,
  token: string | undefined,
  f: FeedbackRecord,
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  if (!url || !token || !url.startsWith("https://")) {
    console.log(JSON.stringify({ event: "lbt_feedback_sheet_skipped", id: f.id, reason: "not_configured" }));
    return false;
  }
  try {
    let res = await fetcher(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        id: f.id,
        created_at: f.createdAt,
        category: f.category,
        message: sheetSafe(f.message),
        email: sheetSafe(f.email),
        page: sheetSafe(f.page),
        locale: f.locale ?? "",
      }),
      redirect: "manual",
    });
    const location = res.headers.get("Location");
    if (res.status >= 300 && res.status < 400 && location?.startsWith("https://")) {
      res = await fetcher(location, { method: "GET", redirect: "follow" });
    }
    const body = (await res.json().catch(() => null)) as { ok?: boolean } | null;
    const ok = res.ok && body?.ok === true;
    if (ok) await db.prepare("UPDATE lbt_feedback SET sheet_sent = 1 WHERE id = ?").bind(f.id).run();
    else console.log(JSON.stringify({ event: "lbt_feedback_sheet_failed", id: f.id, status: res.status, ok: body?.ok ?? null }));
    return ok;
  } catch (err) {
    console.log(JSON.stringify({ event: "lbt_feedback_sheet_failed", id: f.id, error: String(err) }));
    return false;
  }
}
