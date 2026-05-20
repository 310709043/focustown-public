import { ApiError } from "../api/client";

type Translator = (key: string) => string;

/**
 * Canonical error codes the frontend recognises. Source of truth lives in
 * `backend/app/core/exceptions.py`; this union is maintained by hand for
 * IDE autocomplete and documentation. Unknown codes are tolerated at
 * runtime — `getErrorMessage` falls back to `generic.unknown` — so adding
 * a code here is a doc update, not a hard constraint.
 *
 * Synthetic codes (produced by the frontend itself):
 * - `timeout`            — AbortController fired before the response arrived
 * - `refresh_failed`     — token refresh attempt failed; tokens cleared
 * - `malformed_error_body` — server responded non-2xx with unparseable body
 * - `network_error`      — retry budget exhausted with no Response
 * - `request_failed`     — legacy default when neither code nor message available
 */
export type BackendErrorCode =
  | "app_error"
  | "not_found"
  | "conflict"
  | "unauthorized"
  | "forbidden"
  | "validation_error"
  | "rate_limited"
  | "insufficient_funds"
  | "business_error"
  | "idempotency_violation"
  | "internal_error"
  | "password_must_contain_letter_and_digit"
  | "missing_bearer_token"
  | "terms_must_be_accepted"
  | "invalid_credentials"
  | "item_not_found"
  | "session_not_active"
  | "cannot_match_self"
  | "invalid_or_expired_reset_token"
  | "already_owned"
  | "invalid_room_name"
  | "unsupported_media_type"
  | "invalid_room_id"
  | "timeout"
  | "refresh_failed"
  | "malformed_error_body"
  | "network_error"
  | "request_failed";

/**
 * Map a backend error envelope's `code` to a localized message. The translator
 * is the `t` returned by `useTranslations('errors')` or `getTranslations('errors')`.
 *
 * Unknown codes fall back to `generic.unknown` so the UI never shows a raw
 * snake_case identifier to the user.
 */
export function getErrorMessage(
  error: unknown,
  t: Translator,
): string {
  if (error instanceof ApiError) {
    const candidate = t(error.code);
    if (candidate && candidate !== error.code) {
      return candidate;
    }
    if (error.status === 0) {
      return t("generic.network");
    }
    if (error.status === 401 || error.status === 403) {
      return t("generic.unauthorized");
    }
    if (error.status >= 500) {
      return t("generic.server");
    }
    return t("generic.unknown");
  }
  if (error instanceof TypeError) {
    return t("generic.network");
  }
  return t("generic.unknown");
}
