import { ApiError } from "./client";
import { getErrorMessage } from "../i18n/error-message";
import { useToastStore } from "../state/toastStore";

/**
 * Surface an apiFetch failure to the user via the global toaster, using the
 * caller's i18n translator (`useTranslations("errors")`). Kept separate from
 * `apiFetch` so the transport layer stays UI-free — silent contexts like
 * `authStore.bootstrap()` can swallow expected 401s without spawning a toast.
 *
 * T2 will additionally forward this through `POST /api/v1/observability/client-errors`.
 */
export function reportApiError(
  err: unknown,
  t: (key: string) => string,
): void {
  const message = getErrorMessage(err, t);
  useToastStore.getState().push({ kind: "error", message });
}

/** Minimal exception shape safe to log (no stack, no body). */
export function errShape(e: unknown): Record<string, string | number | undefined> {
  if (e instanceof ApiError) return { code: e.code, status: e.status };
  if (e instanceof Error) return { name: e.name };
  return { name: typeof e };
}
