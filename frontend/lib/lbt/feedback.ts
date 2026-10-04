/**
 * Feedback box ("意見箱") client. Independent of the chat transport: it
 * posts straight to the API in both live and demo mode, because feedback
 * about the demo is real feedback too.
 */
export const FEEDBACK_MAX = 1000;
export const FEEDBACK_EMAIL_MAX = 254;
export const FEEDBACK_CATEGORIES = ["idea", "bug", "other"] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

export interface FeedbackSubmission {
  category: FeedbackCategory;
  message: string;
  email: string;
  /** Honeypot: a hidden field people never fill in. */
  website: string;
  page: string;
  locale: string;
}

/** Error codes the API sends back, plus `network` when it can't be reached. */
export type FeedbackErrorCode = "too_many_feedback" | "invalid_email" | "invalid_message" | "network" | "unknown";

export class FeedbackError extends Error {
  constructor(readonly code: FeedbackErrorCode) {
    super(code);
  }
}

const KNOWN: readonly FeedbackErrorCode[] = ["too_many_feedback", "invalid_email", "invalid_message"];

export async function submitFeedback(
  apiBaseUrl: string,
  input: FeedbackSubmission,
  fetchImpl: typeof fetch = (...args) => fetch(...args),
): Promise<string> {
  let res: Response;
  try {
    res = await fetchImpl(`${apiBaseUrl.replace(/\/$/, "")}/api/v1/lbt/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: input.category,
        message: input.message.trim(),
        email: input.email.trim() || null,
        website: input.website,
        page: input.page,
        locale: input.locale,
      }),
    });
  } catch {
    throw new FeedbackError("network");
  }
  const body = (await res.json().catch(() => null)) as { id?: string; error?: { code?: string } } | null;
  if (!res.ok) {
    const code = body?.error?.code as FeedbackErrorCode | undefined;
    throw new FeedbackError(code && KNOWN.includes(code) ? code : "unknown");
  }
  return body?.id ?? "";
}
