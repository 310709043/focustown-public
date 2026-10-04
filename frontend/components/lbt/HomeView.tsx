"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { Link } from "@/i18n/routing";

import {
  ENERGIES,
  ENERGY_ID,
  NICKNAME_MAX,
  PREFERENCES,
} from "@/lib/lbt/constants";
import { normalizeNickname } from "@/lib/lbt/nickname";
import { useLbtStore } from "@/lib/lbt/sessionStore";
import { onRadioGroupKeyDown } from "@/lib/lbt/useRadioArrowKeys";

import { BatteryCharacter } from "./BatteryCharacter";
import { Notice } from "./Notice";
import { TownCount } from "./TownCount";
import { TownSky, Townscape } from "./Townscape";

export function HomeView() {
  const t = useTranslations("lbt");
  const energy = useLbtStore((s) => s.energy);
  const preference = useLbtStore((s) => s.preference);
  const committedNickname = useLbtStore((s) => s.nickname);
  const setEnergy = useLbtStore((s) => s.setEnergy);
  const setPreference = useLbtStore((s) => s.setPreference);
  const startWaiting = useLbtStore((s) => s.startWaiting);
  const openModal = useLbtStore((s) => s.openModal);
  const adult = useLbtStore((s) => s.adult);
  const setAdult = useLbtStore((s) => s.setAdult);
  const town = useLbtStore((s) => s.town);
  const closed = town !== null && !town.open;

  const defaultNickname = t("home.nickname.default");
  const [draft, setDraft] = useState(committedNickname || defaultNickname);
  const energyId = ENERGY_ID[energy];

  const start = () => {
    // The untouched prefilled name is ours, not user input, so it is not cut
    // to the typing limit; anything the visitor edited is normalised.
    const nickname =
      draft === defaultNickname ? draft : normalizeNickname(draft, defaultNickname);
    setDraft(nickname);
    startWaiting(nickname);
  };

  return (
    <main className="view home-view">
      {/* Grid areas: hero / form / info. Desktop fits one screen (hero and
          info on the left, the form as its own column); phones stack them
          in that order so the form comes before the extra cards. */}
      <div className="home-grid">
        <section className="main-stage" aria-labelledby="lbt-hero-title">
          <TownSky />
          <div className="stage-topline">
            <span className="eyebrow">{t("home.eyebrow")}</span>
            {/* One greeting per time of day; CSS shows the one matching <html data-lbt-time>. */}
            <span className="stage-coordinate">
              <span className="by-time t-dawn">{t("home.coordinateDawn")}</span>
              <span className="by-time t-day">{t("home.coordinateDay")}</span>
              <span className="by-time t-dusk">{t("home.coordinateDusk")}</span>
              <span className="by-time t-night">{t("home.coordinate")}</span>
            </span>
          </div>
          <div className="hero-copy">
            <p className="hero-kicker">
              <span className="tiny-star" aria-hidden="true">
                ✳
              </span>{" "}
              {t("home.kicker")}
            </p>
            <TownCount />
            <h1 id="lbt-hero-title" tabIndex={-1}>
              {t("home.titleTop")}
              <br />
              <em>{t("home.titleEm")}</em>
            </h1>
            <p className="hero-subtitle">
              {t("home.subtitleA")}
              <br className="desktop-break" />
              {t("home.subtitleB")}
            </p>
          </div>

          <Townscape />
        </section>

        <div className="selection-card">
          <div className="nickname-field">
            <label htmlFor="lbt-nickname">
              {t("home.nickname.label")}
              <span>{t("home.nickname.hint")}</span>
            </label>
            <input
              id="lbt-nickname"
              maxLength={NICKNAME_MAX}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              aria-describedby="lbt-nickname-note"
            />
            <small id="lbt-nickname-note">{t("home.nickname.note")}</small>
          </div>
          <div className="selection-heading">
            <span>{t("home.energy.heading")}</span>
            <strong>{t("home.energy.strong")}</strong>
          </div>
          <p className="energy-purpose">{t("home.energy.purpose")}</p>
          <div
            className="energy-options"
            role="radiogroup"
            aria-label={t("home.energy.groupAria")}
            onKeyDown={onRadioGroupKeyDown}
          >
            {ENERGIES.map((level) => {
              const id = ENERGY_ID[level];
              const selected = level === energy;
              return (
                <button
                  key={level}
                  type="button"
                  className={`energy-option${selected ? " selected" : ""}`}
                  role="radio"
                  aria-checked={selected}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setEnergy(level)}
                >
                  <span className="energy-symbol" aria-hidden="true">
                    {ENERGIES.slice(0, level).map((bar) => (
                      <i key={bar} />
                    ))}
                  </span>
                  <strong>{t(`energy.${id}.name`)}</strong>
                  <small>{t(`energy.${id}.hint`)}</small>
                </button>
              );
            })}
          </div>
          <div className="preference-row">
            <span>{t("home.preference.label")}</span>
            <div
              className="preference-options"
              role="radiogroup"
              aria-label={t("home.preference.groupAria")}
              onKeyDown={onRadioGroupKeyDown}
            >
              {PREFERENCES.map((id) => {
                const selected = id === preference;
                return (
                  <button
                    key={id}
                    type="button"
                    className={`preference${selected ? " selected" : ""}`}
                    role="radio"
                    aria-checked={selected}
                    tabIndex={selected ? 0 : -1}
                    onClick={() => setPreference(id)}
                  >
                    {t(`preference.${id}`)}
                  </button>
                );
              })}
            </div>
          </div>
          <label className="adult-check" htmlFor="lbt-adult">
            <input
              id="lbt-adult"
              type="checkbox"
              checked={adult}
              onChange={(event) => setAdult(event.target.checked)}
              aria-describedby="lbt-adult-hint"
            />
            <span>{t("home.adult")}</span>
            <small id="lbt-adult-hint">
              {t("home.adultHint")}{" "}
              {t.rich("home.adultHintPolicies", {
                terms: (chunks) => <Link href="/policies/terms">{chunks}</Link>,
                guidelines: (chunks) => <Link href="/policies/guidelines">{chunks}</Link>,
                privacy: (chunks) => <Link href="/policies/privacy">{chunks}</Link>,
              })}
            </small>
          </label>
          {closed ? (
            <p className="closed-note" role="status">
              {t("home.closed", { hours: town?.hours ?? "" })}
            </p>
          ) : null}
          <Notice />
          <button
            type="button"
            className="primary-button"
            onClick={start}
            disabled={closed}
          >
            {t("home.start")} <span aria-hidden="true">↗</span>
          </button>
          <p className="selection-note">
            <span aria-hidden="true">✦</span> {t("home.startNote")}
          </p>
        </div>

        <aside className="side-rail" aria-label={t("home.side.aria")}>
          <div className="side-card battery-card">
            <div className="side-card-top">
              <span>{t("home.side.statusLabel")}</span>
              <span className="utility-number">{`0${energy} / 03`}</span>
            </div>
            <BatteryCharacter energy={energy} />
            <h2>{t(`energy.${energyId}.title`)}</h2>
            <p>{t(`energy.${energyId}.description`)}</p>
            <div className="battery-footnote">
              <span className="signal-bars" aria-hidden="true">
                ▂ ▄ ▆
              </span>
              <span>{t("home.side.footnote")}</span>
            </div>
          </div>
          <div className="side-card how-card">
            <span className="small-label">{t("home.side.promiseLabel")}</span>
            <ol>
              {(["promise1", "promise2", "promise3"] as const).map((key, index) => (
                <li key={key}>
                  <span>{`0${index + 1}`}</span>
                  <p>{t(`home.side.${key}`)}</p>
                </li>
              ))}
            </ol>
            <div className="support-invitation">
              <h3>{t("home.side.supportTitle")}</h3>
              <p>{t("home.side.supportBody")}</p>
              <button
                type="button"
                className="support-link"
                onClick={() => openModal({ type: "support" })}
              >
                {t("home.side.support")} <span aria-hidden="true">↗</span>
              </button>
              <p className="support-note">{t("home.side.supportNote")}</p>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
