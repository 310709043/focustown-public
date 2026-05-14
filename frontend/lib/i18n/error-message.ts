import { ApiError } from "../api/client";

type Translator = (key: string) => string;

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
