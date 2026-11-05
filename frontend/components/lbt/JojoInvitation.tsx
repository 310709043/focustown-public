"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useLbtStore } from "@/lib/lbt/sessionStore";

/** Separate from human matching: an explicit, disclosed choice after a server-timed wait. */
export function JojoInvitation() {
  const t = useTranslations("lbt.jojo");
  const availableAt = useLbtStore(s => s.jojoAvailableAt);
  const connection = useLbtStore(s => s.connection);
  const starting = useLbtStore(s => s.jojoStarting);
  const start = useLbtStore(s => s.startJojo);
  const [ready, setReady] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (availableAt === null) return;
    const timer = setTimeout(() => setReady(true), Math.max(0, availableAt - Date.now()));
    return () => clearTimeout(timer);
  }, [availableAt]);

  if (!ready || dismissed || availableAt === null) return null;
  return (
    <section className="companion-invitation" aria-labelledby="jojo-title">
      <h2 id="jojo-title">{t("title")}</h2>
      <p>{t("body")}</p>
      <p>{t("privacy")}</p>
      <div className="companion-actions">
        <button type="button" className="primary-button" disabled={starting || connection !== "open"} onClick={start}>
          {t(starting ? "starting" : "accept")}
        </button>
        <button type="button" className="text-button" disabled={starting} onClick={() => setDismissed(true)}>
          {t("decline")}
        </button>
      </div>
    </section>
  );
}
