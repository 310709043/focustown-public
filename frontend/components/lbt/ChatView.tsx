"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { ENERGY_ID, MESSAGE_MAX } from "@/lib/lbt/constants";
import { formatClock } from "@/lib/lbt/format";
import { remainingSeconds, useLbtStore } from "@/lib/lbt/sessionStore";
import type { ChatLine } from "@/lib/lbt/types";

import { BatteryAvatar } from "./BatteryAvatar";
import { ChimeToggle } from "./ChimeToggle";
import { Notice } from "./Notice";

const bars = (level: number) => "▮".repeat(level);

export function ChatView() {
  const t = useTranslations("lbt");
  const energy = useLbtStore((s) => s.energy);
  const preference = useLbtStore((s) => s.preference);
  const nickname = useLbtStore((s) => s.nickname);
  const partner = useLbtStore((s) => s.partner);
  const selfAvatar = useLbtStore((s) => s.selfAvatar);
  const simulated = useLbtStore((s) => s.simulated);
  const remaining = useLbtStore(remainingSeconds);
  const lines = useLbtStore((s) => s.lines);
  const typing = useLbtStore((s) => s.partnerTyping);
  const extendMine = useLbtStore((s) => s.extendMine);
  const extendPartner = useLbtStore((s) => s.extendPartner);
  const connection = useLbtStore((s) => s.connection);
  const topicId = useLbtStore((s) => s.topicId);
  const sendMessage = useLbtStore((s) => s.sendMessage);
  const notifyTyping = useLbtStore((s) => s.notifyTyping);
  const extend = useLbtStore((s) => s.extend);
  const leave = useLbtStore((s) => s.leave);
  const drawTopic = useLbtStore((s) => s.drawTopic);
  const dismissTopic = useLbtStore((s) => s.dismissTopic);
  const openModal = useLbtStore((s) => s.openModal);

  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);

  // The demo partner's name is localised here; a real partner's is theirs.
  const partnerName =
    simulated || !partner ? t("partner.name") : partner.nickname;
  const selfId = ENERGY_ID[energy];
  const partnerEnergy = partner?.energy ?? 2;
  const partnerId = ENERGY_ID[partnerEnergy];
  const timeUp = remaining === 0;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const node = messagesRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [lines.length, typing]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (sendMessage(draft)) setDraft("");
  };

  const applyTopic = () => {
    if (!topicId) return;
    setDraft(t(`topics.${topicId}`));
    dismissTopic();
    inputRef.current?.focus();
  };

  const systemText = (
    code: Extract<ChatLine, { kind: "system" }>["code"],
  ): string => {
    if (code === "energyShown") {
      return t("chat.system.energyShown", {
        energy: t(`energy.${selfId}.name`),
        pace: t(`energy.${selfId}.pace`),
      });
    }
    return t(`chat.system.${code}`);
  };

  const partnerText = (
    line: Extract<ChatLine, { kind: "partner" }>,
  ): string => {
    if (line.text !== undefined) return line.text;
    if (line.ref?.type === "reply") return t(`replies.${line.ref.id}`);
    return t(
      `partner.opener.${preference}.${energy === 1 ? "low" : "normal"}`,
      {
        nickname,
        partner: partnerName,
      },
    );
  };

  const extendLabel = extendMine
    ? t("chat.aside.extendPending")
    : t("chat.aside.extend");
  const extendHint = extendMine
    ? simulated
      ? t("chat.aside.hintPending")
      : t("chat.aside.hintPendingLive")
    : t("chat.aside.hint");

  return (
    <main className="view chat-view">
      <div className="chat-shell">
        <section className="chat-main" aria-label={t("chat.mainAria")}>
          <div className="chat-header">
            <div className="partner-profile">
              <span className="small-label">
                {partner?.role === "companion"
                  ? t("companion.label")
                  : simulated
                    ? t("chat.partnerLabel")
                    : t("chat.partnerLabelLive")}
              </span>
              <h1 tabIndex={-1}>
                <span className="profile-prefix">
                  {t("chat.partnerPrefix")}
                </span>
                <span>{partnerName}</span>
              </h1>
              <p className="partner-details">
                <span className="profile-energy">
                  {`${bars(partnerEnergy)} ${t(`energy.${partnerId}.name`)}`}
                </span>
                {partner ? (
                  <span>{t(`preference.${partner.preference}`)}</span>
                ) : null}
              </p>
              <p className="profile-pace">{t(`energy.${partnerId}.pace`)}</p>
              {partner?.role === "companion" ? (
                <p className="companion-disclosure">
                  {t("companion.chatDisclosure")}
                </p>
              ) : null}
            </div>
            <div className="chat-header-actions">
              <span className="session-timer" aria-label={t("chat.timerAria")}>
                {formatClock(remaining)}
              </span>
              <button
                type="button"
                className="mobile-extend-button"
                aria-label={t("chat.extendAria")}
                disabled={extendMine}
                onClick={extend}
              >
                {extendMine
                  ? t("chat.extendMobilePending")
                  : t("chat.extendMobile")}
              </button>
              <button type="button" className="leave-button" onClick={leave}>
                {t("chat.leave")} <span aria-hidden="true">↗</span>
              </button>
            </div>
          </div>

          <div className="self-profile">
            <span className="profile-prefix">{t("chat.selfPrefix")}</span>
            <strong>{nickname}</strong>
            <span>{`${bars(energy)} ${t(`energy.${selfId}.name`)}`}</span>
            <span>{t(`preference.${preference}`)}</span>
          </div>

          {connection === "offline" ? (
            <p className="chat-offline" role="status">
              {t("chat.offline")}
            </p>
          ) : null}

          <div className="chat-messages" ref={messagesRef} aria-live="polite">
            {lines.map((line) =>
              line.kind === "me" ? (
                <div key={line.id} className="message me">
                  {selfAvatar ? (
                    <BatteryAvatar avatar={selfAvatar} />
                  ) : (
                    <span className="avatar" aria-hidden="true">
                      {t("chat.avatarMe")}
                    </span>
                  )}
                  <div className="message-content">
                    <span className="message-sender">
                      {t("chat.senderMe", { name: nickname })}
                    </span>
                    <div className="bubble">{line.text}</div>
                  </div>
                </div>
              ) : line.kind === "partner" ? (
                <div key={line.id} className="message other">
                  {partner?.avatar ? (
                    <BatteryAvatar avatar={partner.avatar} />
                  ) : (
                    <span className="avatar" aria-hidden="true">
                      ✳
                    </span>
                  )}
                  <div className="message-content">
                    <span className="message-sender">
                      {simulated
                        ? t("chat.senderPartner", { name: partnerName })
                        : t("chat.senderPartnerLive", { name: partnerName })}
                    </span>
                    <div className="bubble">{partnerText(line)}</div>
                  </div>
                </div>
              ) : (
                <div key={line.id} className="system-note">
                  {line.code === "met" ? (
                    <>
                      <span aria-hidden="true">✳</span>{" "}
                    </>
                  ) : null}
                  {systemText(line.code)}
                </div>
              ),
            )}
            {typing ? (
              <div
                className="typing-indicator"
                role="status"
                aria-label={t("chat.typing")}
              >
                <span aria-hidden="true" />
                <span aria-hidden="true" />
                <span aria-hidden="true" />
              </div>
            ) : null}
          </div>

          <div className="chat-bottom">
            {extendPartner && !extendMine ? (
              <div className="extend-banner" role="status">
                <span>{t("chat.partnerWantsExtend")}</span>
                <button type="button" onClick={extend}>
                  {t("chat.extendAgree")}
                </button>
              </div>
            ) : null}
            <Notice />
            <div className="prompt-row">
              <span>{t("chat.promptLabel")}</span>
              <button type="button" onClick={drawTopic}>
                {t("chat.promptDraw")} <span aria-hidden="true">↗</span>
              </button>
            </div>
            {topicId ? (
              <div className="topic-card" aria-live="polite">
                <span className="small-label">{t("chat.topicLabel")}</span>
                <p>{t(`topics.${topicId}`)}</p>
                <div className="topic-actions">
                  <button type="button" onClick={applyTopic}>
                    {t("chat.topicUse")}
                  </button>
                  <button type="button" onClick={drawTopic}>
                    {t("chat.topicNext")} ↗
                  </button>
                </div>
              </div>
            ) : null}
            <form className="composer" onSubmit={submit}>
              <label htmlFor="lbt-message" className="sr-only">
                {t("chat.composerLabel")}
              </label>
              <input
                id="lbt-message"
                ref={inputRef}
                value={draft}
                maxLength={MESSAGE_MAX}
                autoComplete="off"
                disabled={timeUp}
                placeholder={
                  timeUp
                    ? t("chat.composerTimeUp")
                    : t("chat.composerPlaceholder")
                }
                onChange={(event) => {
                  setDraft(event.target.value);
                  if (event.target.value) notifyTyping();
                }}
              />
              <button
                type="submit"
                aria-label={t("chat.send")}
                disabled={timeUp}
              >
                ↑
              </button>
            </form>
            <p>
              {t("chat.privacy")}
              <span className="chat-bottom-actions">
                <ChimeToggle />
                <button
                  type="button"
                  onClick={() => openModal({ type: "report" })}
                >
                  {t("chat.report")}
                </button>
              </span>
            </p>
          </div>
        </section>

        <aside className="chat-aside">
          <div className="aside-lamp" aria-hidden="true">
            ✳
          </div>
          <span className="small-label">{t("chat.aside.label")}</span>
          <h2>
            {t("chat.aside.titleTop")}
            <br />
            {t("chat.aside.titleBottom")}
          </h2>
          <p>{t("chat.aside.body")}</p>
          <div className="aside-divider" />
          <span className="small-label">{t("chat.aside.energyLabel")}</span>
          <strong>{t(`energy.${selfId}.name`)}</strong>
          <button
            type="button"
            className="extend-button"
            disabled={extendMine}
            onClick={extend}
          >
            {extendLabel}{" "}
            {extendMine ? null : <span aria-hidden="true">＋</span>}
          </button>
          <p className="extend-hint">{extendHint}</p>
          <p className="aside-help">{t("chat.aside.help")}</p>
        </aside>
      </div>
    </main>
  );
}
