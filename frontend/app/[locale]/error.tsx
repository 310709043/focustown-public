"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import * as Sentry from "@sentry/nextjs";

import { Link } from "@/i18n/routing";

export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errors");

  useEffect(() => {
    console.error("[locale-error]", error.digest ?? "<no-digest>");
    Sentry.captureException(error);
  }, [error]);

  return (
    <main
      role="alert"
      className="min-h-screen flex flex-col items-center justify-center px-6 text-center"
    >
      <h1 className="text-2xl font-semibold text-[var(--text)] mb-3">
        {t("generic.unknown")}
      </h1>
      <p className="text-sm text-[var(--muted)] mb-8 max-w-md">
        {t("generic.server")}
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="px-5 py-2.5 rounded-md bg-[var(--a3)] text-white hover:bg-[var(--a1)] transition-colors"
        >
          {t("generic.retry")}
        </button>
        <Link
          href="/town"
          className="px-5 py-2.5 rounded-md border border-[var(--border)] text-[var(--text)] hover:border-[var(--border2)] transition-colors"
        >
          {t("generic.back_to_town")}
        </Link>
      </div>
    </main>
  );
}
