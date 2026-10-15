"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState, type FormEvent } from "react";

import { Link } from "@/i18n/routing";
import { config } from "@/lib/config";
import { useUnlocks, type RedeemOutcome } from "@/lib/lbt/unlocks";

/** Enter a code bought elsewhere; this device then gets the koi pond scene. */
export function UnlockForm() {
  const t = useTranslations("lbt.unlock");
  const load = useUnlocks((s) => s.load);
  const redeem = useUnlocks((s) => s.redeem);
  const unlocked = useUnlocks((s) => s.items.includes("koi-pond"));
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<RedeemOutcome | null>(null);

  useEffect(() => {
    void load(config.apiBaseUrl);
  }, [load]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !code.trim()) return;
    setBusy(true);
    setOutcome(await redeem(config.apiBaseUrl, code));
    setBusy(false);
  };

  return (
    <article className="unlock">
      <h1>{t("title")}</h1>
      <p>{t("intro")}</p>
      {unlocked ? (
        <p className="unlock-done" role="status">
          {t("done")} <Link href="/">{t("home")}</Link>
        </p>
      ) : (
        <form onSubmit={submit} className="unlock-form">
          <label htmlFor="lbt-unlock-code">{t("label")}</label>
          <input
            id="lbt-unlock-code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="XXXX-XXXX-XXXX"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={20}
            aria-describedby="lbt-unlock-status"
          />
          <button type="submit" disabled={busy || !code.trim()}>
            {busy ? t("working") : t("submit")}
          </button>
          <p id="lbt-unlock-status" role="status" className="unlock-status">
            {outcome && outcome !== "ok" ? t(`error.${outcome}`) : ""}
          </p>
        </form>
      )}
      <p className="unlock-note">{t("note")}</p>
    </article>
  );
}
