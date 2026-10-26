"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

import { ENERGY_ID, MESSAGE_MAX } from "@/lib/lbt/constants";
import { remainingSeconds, useLbtStore } from "@/lib/lbt/sessionStore";
import { isQuestion } from "@/lib/lbt/skyTopics";
import type { ChatLine } from "@/lib/lbt/types";

import { BatteryAvatar } from "./BatteryAvatar";
import { ByTime } from "./ByTime";
import { ChatStage, usePartnerName } from "./ChatStage";
import { ChimeToggle } from "./ChimeToggle";
import { Notice } from "./Notice";
import { PlugPanel } from "./PlugPanel";
import { SkyTopicSuggestion } from "./SkyTopics";

type SystemLine = Extract<ChatLine, { kind: "system" }>;

function TopicIcon() {
  return (
    <svg className="draw-topic-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="4" y="5" width="12" height="16" rx="2" />
      <path d="M8 3h10a2 2 0 0 1 2 2v14" />
    </svg>
  );
}

export function ChatView() {
  const t = useTranslations("lbt");
  const energy = useLbtStore((s) => s.energy);
  const preference = useLbtStore((s) => s.preference);
  const language = useLbtStore((s) => s.language) ?? "zh-TW";
  const nickname = useLbtStore((s) => s.nickname);
  const partner = useLbtStore((s) => s.partner);
  const selfAvatar = useLbtStore((s) => s.selfAvatar);
  const simulated = useLbtStore((s) => s.simulated);
  const remaining = useLbtStore(remainingSeconds);
  const lines = useLbtStore((s) => s.lines);
  const typing = useLbtStore((s) => s.partnerTyping);
  const connection = useLbtStore((s) => s.connection);
  const mode = useLbtStore((s) => s.mode);
  const topicId = useLbtStore((s) => s.topicId);
  const sendMessage = useLbtStore((s) => s.sendMessage);
  const notifyTyping = useLbtStore((s) => s.notifyTyping);
  const drawTopic = useLbtStore((s) => s.drawTopic);
  const skyTopic = useLbtStore((s) => s.skyTopic);
  const clearSkyTopic = useLbtStore((s) => s.clearSkyTopic);
  const dismissTopic = useLbtStore((s) => s.dismissTopic);
  const openModal = useLbtStore((s) => s.openModal);

  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);

  const partnerName = usePartnerName();
  const partnerLanguage = partner?.language ?? "zh-TW";
  const sharedLanguage = language === "both"
    ? partnerLanguage
    : partnerLanguage === "both" || language === partnerLanguage ? language : null;
  const selfId = ENERGY_ID[energy];
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

  /** A question from the sky opens the chat as it is; a keyword gets a frame. */
  const skyOpener = (word: string) =>
    t(isQuestion(word) ? "chat.skyOpenerQuestion" : "chat.skyOpener", { word });

  const putInComposer = (text: string) => {
    setDraft(text);
    inputRef.current?.focus();
  };

  const applySkyTopic = () => {
    if (!skyTopic) return;
    putInComposer(skyOpener(skyTopic));
    clearSkyTopic();
  };

  const applyTopic = () => {
    if (!topicId) return;
    putInComposer(t(`topics.${topicId}`));
    dismissTopic();
  };

  const systemText = (code: SystemLine["code"]): ReactNode => {
    switch (code) {
      case "met":
        return (
          <>
            {t("chat.system.met")}
            {sharedLanguage ? <><br />{t("language.shared", { language: t(`language.${sharedLanguage}`) })}</> : null}
          </>
        );
      case "energyShown":
        return t("chat.system.energyShown", {
          energy: t(`energy.${selfId}.name`),
          pace: t(`energy.${selfId}.pace`),
        });
      case "extendAsked":
      case "extendPartnerAsked":
        return t(`chat.system.${code}`, { name: partnerName });
      case "extendAccepted":
        return (
          <ByTime
            night={t("chat.system.extendAccepted.lamp")}
            day={t("chat.system.extendAccepted.bench")}
          />
        );
      default:
        return null;
    }
  };

  const partnerText = (line: Extract<ChatLine, { kind: "partner" }>): string => {
    if (line.text !== undefined) return line.text;
    if (line.ref?.type === "reply") return t(`replies.${line.ref.id}`);
    return t(`partner.opener.${preference}.${energy === 1 ? "low" : "normal"}`, {
      nickname,
      partner: partnerName,
    });
  };

  return (
    <main className="view chat-view">
      <section className="chat-main" aria-label={t("chat.mainAria")}>
        <ChatStage />

        <div className="chat-body">
          <div className="chat-thread">
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
                  <div key={line.id} className={`system-note is-${line.code}`}>
                    <span className="system-text">{systemText(line.code)}</span>
                  </div>
                ),
              )}
              {typing ? (
                <div className="typing-indicator" role="status" aria-label={t("chat.typing")}>
                  <span aria-hidden="true" />
                  <span aria-hidden="true" />
                  <span aria-hidden="true" />
                </div>
              ) : null}
            </div>
          </div>

          <div className="chat-bottom">
            <Notice />
            {skyTopic && !topicId ? (
              <div className="topic-card sky-topic-card" aria-live="polite">
                <span className="small-label">{t("chat.skyLabel")}</span>
                <p>{skyOpener(skyTopic)}</p>
                <div className="topic-actions">
                  <button type="button" onClick={applySkyTopic}>
                    {t("chat.topicUse")}
                  </button>
                  <button type="button" onClick={clearSkyTopic}>
                    {t("chat.skyDismiss")}
                  </button>
                </div>
              </div>
            ) : null}
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
            <div className="composer-row">
              <button type="button" className="draw-topic" onClick={drawTopic}>
                <TopicIcon />
                <span className="draw-topic-text">{t("chat.promptDraw")}</span>
              </button>
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
                  placeholder={timeUp ? t("chat.composerTimeUp") : t("chat.composerPlaceholder")}
                  onChange={(event) => {
                    setDraft(event.target.value);
                    if (event.target.value) notifyTyping();
                  }}
                />
                <button
                  type="submit"
                  aria-label={t("chat.send")}
                  disabled={timeUp || (mode === "live" && connection !== "open")}
                >
                  ↑
                </button>
              </form>
            </div>
          </div>

          <aside className="chat-aside" aria-label={t("chat.asideAria")}>
            <PlugPanel />
            <SkyTopicSuggestion onUse={(word) => putInComposer(skyOpener(word))} />
            <div className="chat-foot">
              <p className="aside-help">{t("chat.aside.help")}</p>
              <p className="chat-privacy">{t("chat.privacy")}</p>
              <p className="chat-bottom-actions">
                <ChimeToggle />
                <button type="button" onClick={() => openModal({ type: "report" })}>
                  {t("chat.report")}
                </button>
              </p>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
