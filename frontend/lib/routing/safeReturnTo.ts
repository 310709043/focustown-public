/**
 * Same-origin guard for post-auth redirects.
 *
 * Sign-in and sign-up accept a ``?returnTo=<path>`` query so a user
 * who deep-linked to ``/u/<id>`` lands back on that page after auth.
 * Without a guard, ``?returnTo=//attacker.example`` (protocol-relative)
 * would silently send the user off-origin after they hand over their
 * password — a classic open-redirect phishing vector.
 *
 * Rule: accept only single-slash internal paths. Reject ``null``,
 * empty strings, absolute URLs, and protocol-relative paths.
 */
export function sanitizeReturnTo(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (!raw.startsWith("/")) return null;
  if (raw.startsWith("//")) return null;
  return raw;
}
