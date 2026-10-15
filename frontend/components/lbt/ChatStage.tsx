"use client";

import { useTranslations } from "next-intl";

import { stageAvatars } from "@/lib/lbt/avatars";
import { ENERGY_ID, SESSION_SECONDS } from "@/lib/lbt/constants";
import { formatClock } from "@/lib/lbt/format";
import { remainingSeconds, useLbtStore } from "@/lib/lbt/sessionStore";

import { BenchScene } from "./BenchScene";
import { ByTime } from "./ByTime";
import { EnergyGlyph } from "./EnergyGlyph";
import { useChatFaces } from "./useChatFaces";

/** The partner's name: the demo's is localised, a real person's is their own. */
export function usePartnerName(): string {
  const t = useTranslations("lbt");
  const partner = useLbtStore((s) => s.partner);
  const simulated = useLbtStore((s) => s.simulated);
  return simulated || !partner ? t("partner.name") : partner.nickname;
}

/**
 * Top of the chat: the two of you on a bench under a street lamp. The
 * ring round the lamp is the time left, the cables are the extend
 * handshake, the batteries' faces follow the conversation. Both names,
 * batteries and intents are always shown, and 說聲晚安 is always here.
 */
export function ChatStage() {
  const t = useTranslations("lbt");
  const lines = useLbtStore((s) => s.lines);
  const partner = useLbtStore((s) => s.partner);
  const simulated = useLbtStore((s) => s.simulated);
  const nickname = useLbtStore((s) => s.nickname);
  const energy = useLbtStore((s) => s.energy);
  const preference = useLbtStore((s) => s.preference);
  const selfAvatar = useLbtStore((s) => s.selfAvatar);
  const partnerTyping = useLbtStore((s) => s.partnerTyping);
  const extendMine = useLbtStore((s) => s.extendMine);
  const extendPartner = useLbtStore((s) => s.extendPartner);
  const leave = useLbtStore((s) => s.leave);
  const remaining = useLbtStore(remainingSeconds);
  const partnerName = usePartnerName();

  const lastMinute = remaining > 0 && remaining <= 60;
  const faces = useChatFaces(lines, { extendMine, extendPartner, lastMinute, partnerTyping });
  const [partnerAvatar, ownAvatar] = stageAvatars(partner?.avatar, selfAvatar);
  const partnerEnergy = partner?.energy ?? 2;
  const partnerId = ENERGY_ID[partnerEnergy];
  const selfId = ENERGY_ID[energy];
  const label =
    partner?.role === "companion"
      ? t("companion.label")
      : simulated
        ? t("chat.partnerLabel")
        : t("chat.partnerLabelLive");

  return (
    <section className={`chat-stage${lastMinute ? " is-last-minute" : ""}`} aria-label={t("chat.stage.aria")}>
      <div className="stage-sky">
        <BenchScene
          partnerAvatar={partnerAvatar}
          selfAvatar={ownAvatar}
          partnerFace={faces.partner}
          selfFace={faces.self}
          partnerBeat={faces.partnerBeat}
          selfBeat={faces.selfBeat}
          partnerPlugged={extendPartner || faces.cheering}
          selfPlugged={extendMine || faces.cheering}
          left={Math.max(0, Math.min(1, remaining / SESSION_SECONDS))}
          lastMinute={lastMinute}
        />
        {partnerTyping ? (
          <span className="stage-typing" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        ) : null}
        {extendPartner ? <span className="stage-spark is-partner" aria-hidden="true" /> : null}
        {extendMine ? <span className="stage-spark is-self" aria-hidden="true" /> : null}
        {faces.cheering ? (
          <>
            <span className="stage-flare" aria-hidden="true" />
            <span className="stage-star s1" aria-hidden="true">✦</span>
            <span className="stage-star s2" aria-hidden="true">✧</span>
            <span className="stage-star s3" aria-hidden="true">✦</span>
            <span className="stage-star s4" aria-hidden="true">✧</span>
            <span className="stage-badge" aria-hidden="true">
              <ByTime night={t("chat.stage.badge.lamp")} day={t("chat.stage.badge.bench")} />
            </span>
          </>
        ) : null}

        <div className="stage-timer">
          <span className="stage-timer-label">
            <ByTime
              night={t("chat.stage.timer.night")}
              dawn={t("chat.stage.timer.dawn")}
              day={t("chat.stage.timer.day")}
              dusk={t("chat.stage.timer.dusk")}
            />
          </span>
          <span className="session-timer" role="timer" aria-label={t("chat.timerAria")}>
            {formatClock(remaining)}
          </span>
        </div>
        <button type="button" className="leave-button" onClick={leave}>
          {t("chat.leave")} <span aria-hidden="true">↗</span>
        </button>
      </div>

      <div className="bench-people">
        <div className="partner-profile bench-tag">
          <span className="small-label">{label}</span>
          <h1 tabIndex={-1}>
            <span className="profile-prefix">{t("chat.partnerPrefix")}</span>
            <span className="tag-name">{partnerName}</span>
          </h1>
          <p className="partner-details tag-details">
            <span className={`profile-energy is-${partnerId}`}>
              <EnergyGlyph level={partnerEnergy} />
              {t(`energy.${partnerId}.name`)}
            </span>
            {partner ? <span>· {t(`preference.${partner.preference}`)}</span> : null}
          </p>
          <p className="profile-pace">{t(`energy.${partnerId}.pace`)}</p>
          {partner?.role === "companion" ? (
            <p className="companion-disclosure">{t("companion.chatDisclosure")}</p>
          ) : null}
        </div>
        <div className="self-profile bench-tag">
          <span className="small-label">{t("chat.selfPrefix")}</span>
          <strong className="tag-name">{nickname}</strong>
          <p className="tag-details">
            <span className={`profile-energy is-${selfId}`}>
              <EnergyGlyph level={energy} />
              {t(`energy.${selfId}.name`)}
            </span>
            <span>· {t(`preference.${preference}`)}</span>
          </p>
          <p className="profile-pace">{t(`energy.${selfId}.pace`)}</p>
        </div>
      </div>
    </section>
  );
}
