"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState, type FormEvent } from "react";

import { Link } from "@/i18n/routing";
import { config } from "@/lib/config";
import { POND_OFFER } from "@/lib/lbt/pond";
import { RAIN_ITEM, STYLE_ITEM, STYLES } from "@/lib/lbt/looks";
import { useUnlocks, type RedeemOutcome, type UnlockItem } from "@/lib/lbt/unlocks";
import { useUnlockExpiry } from "@/lib/lbt/useUnlockExpiry";

/** The name key (lbt.looks.*) of each look a code can unlock, besides the pond. */
const LOOK_NAME: Partial<Record<UnlockItem, string>> = {
  [RAIN_ITEM]: "rainName",
  ...Object.fromEntries(STYLES.map((s) => [STYLE_ITEM[s], `styles.${s}`])),
};

/**
 * Enter a code bought elsewhere; this device then gets the koi pond or a
 * look. The form stays open for another code. The e-mail links to #code.
 */
export function UnlockForm() {
  useUnlockExpiry();
  const locale = useLocale();
  const t = useTranslations("lbt.unlock");
  const tl = useTranslations("lbt.looks");
  const load = useUnlocks((s) => s.load);
  const redeem = useUnlocks((s) => s.redeem);
  const items = useUnlocks((s) => s.items);
  const unlocked = items.includes("koi-pond");
  const looks = items.flatMap((item) => (LOOK_NAME[item] ? [tl(LOOK_NAME[item])] : []));
  const expiresAt = useUnlocks((s) => s.expiresAt);
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
    const result = await redeem(config.apiBaseUrl, code);
    setOutcome(result);
    if (result === "ok") setCode("");
    setBusy(false);
  };

  return (
    <section className="unlock-redeem" id="code" aria-labelledby="lbt-unlock-redeem">
      <h2 id="lbt-unlock-redeem">{t("redeemTitle")}</h2>
      {unlocked ? (
        <p className="unlock-done" role="status">
          {t("done")} <Link href="/">{t("home")}</Link>
        </p>
      ) : null}
      {looks.length ? (
        <p className="unlock-done" role="status">
          {t("doneLooks", { names: looks.join("、") })} <Link href="/">{t("home")}</Link>
        </p>
      ) : null}
      <form onSubmit={submit} className="unlock-form">
        <label htmlFor="lbt-unlock-code">{unlocked || looks.length ? t("labelAnother") : t("label")}</label>
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
          {outcome && outcome !== "ok" ? t(`error.${outcome}`, { devices: POND_OFFER.devices }) : ""}
        </p>
      </form>
      {unlocked && expiresAt !== null ? (
        <p className="unlock-note">{t("expires", { date: new Intl.DateTimeFormat(locale, {
          timeZone: "Asia/Taipei", dateStyle: "medium", timeStyle: "short",
        }).format(expiresAt) })}</p>
      ) : null}
      <p className="unlock-note">{t("note")}</p>
    </section>
  );
}
