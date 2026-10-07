"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState, type AnimationEvent } from "react";

import { config } from "@/lib/config";
import { useLbtStore } from "@/lib/lbt/sessionStore";
import { currentSkyTopic, useSkyTopics, type SkyTopic } from "@/lib/lbt/skyTopics";

/** On phones (no carriers) and under reduced motion, words change on a timer instead. */
const TIMER_MS = 7000;

function useSkyTopic(): SkyTopic {
  const mode = useLbtStore((s) => s.mode);
  const load = useSkyTopics((s) => s.load);
  const topic = useSkyTopics(currentSkyTopic);
  useEffect(() => {
    void load(mode, config.apiBaseUrl);
  }, [load, mode]);
  return topic;
}

/** Tap a sky topic: keep it for the chat, and say so. */
function useTake() {
  const takeSkyTopic = useLbtStore((s) => s.takeSkyTopic);
  const [taken, setTaken] = useState<string | null>(null);
  const take = (word: string) => {
    takeSkyTopic(word);
    setTaken(word);
  };
  return { taken, take };
}

/**
 * Today's sky topic, carried across the home stage by whatever fits the
 * hour: a hot-air balloon at dawn, a plane banner by day, a kite at dusk,
 * a neon sign at night. CSS shows the one matching <html data-lbt-time>;
 * the word moves on each time the carrier finishes a pass.
 */
export function SkyTopics() {
  const t = useTranslations("lbt.sky");
  const topic = useSkyTopic();
  const next = useSkyTopics((s) => s.next);
  const { taken, take } = useTake();

  const onPass = (event: AnimationEvent<HTMLElement>) => {
    if (event.target === event.currentTarget) next();
  };
  const label = t(`kind.${topic.kind}`);
  const tag = (
    <span className="sky-tag">
      <small>{label}</small>
      <b>{topic.word}</b>
    </span>
  );
  const common = {
    type: "button" as const,
    onClick: () => take(topic.word),
    onAnimationIteration: onPass,
    "aria-label": t("aria", { label, word: topic.word }),
  };

  return (
    <div className="sky-topics">
      <button {...common} className="sky-carrier carrier-balloon">
        <svg className="balloon-art" viewBox="0 0 84 112" aria-hidden="true" focusable="false">
          <path d="M42 4 C16 4 6 26 8 44 C10 62 30 74 34 86 L50 86 C54 74 74 62 76 44 C78 26 68 4 42 4Z" className="balloon-envelope" />
          <path d="M42 4 C32 20 30 60 36 86 M42 4 C52 20 54 60 48 86" className="balloon-seam" />
          <path d="M35 86 L37 96 M49 86 L47 96" className="balloon-rope" />
          <rect x="35" y="96" width="14" height="10" rx="2" className="balloon-basket" />
        </svg>
        <span className="carrier-rope" aria-hidden="true" />
        {tag}
      </button>
      <button {...common} className="sky-carrier carrier-plane">
        <span className="sky-tag banner">
          <small>{label}</small>
          <b>{topic.word}</b>
        </span>
        <span className="carrier-rope" aria-hidden="true" />
        <svg className="plane-art" viewBox="0 0 60 28" aria-hidden="true" focusable="false">
          <path d="M2 15 L44 13 C53 12 58 14 58 15 C58 16 53 18 44 17 L2 15Z" className="plane-body" />
          <path d="M24 14 L33 2 L37 2 L33 14Z M24 16 L33 27 L37 27 L33 16Z M5 15 L2 6 L7 6 L11 14Z" className="plane-wing" />
        </svg>
      </button>
      <button {...common} className="sky-carrier carrier-kite">
        <svg className="kite-line" viewBox="0 0 190 270" aria-hidden="true" focusable="false">
          <path d="M182 2 C150 60 110 110 60 270" />
        </svg>
        <svg className="kite-art" viewBox="0 0 64 120" aria-hidden="true" focusable="false">
          <path d="M32 2 L62 34 L32 74 L2 34Z" className="kite-sail" />
          <path d="M32 2 L32 74 M2 34 L62 34" className="kite-spar" />
          <path d="M32 74 C28 84 36 90 32 100 C28 108 36 112 32 118" className="kite-tail" />
        </svg>
        {tag}
      </button>
      <button {...common} className="sky-carrier carrier-neon">
        <small>{label}</small>
        <b>{topic.word}</b>
      </button>
      <p className="sky-taken" role="status">
        {taken ? t("taken", { word: taken }) : ""}
      </p>
    </div>
  );
}

/** Phones: one quiet line under the subtitle, changing every few seconds. */
export function SkyTopicLine() {
  const t = useTranslations("lbt.sky");
  const topic = useSkyTopic();
  const next = useSkyTopics((s) => s.next);
  const { taken, take } = useTake();

  useEffect(() => {
    const phone = window.matchMedia?.("(max-width: 610px)");
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const timer = setInterval(() => {
      if (document.hidden) return;
      if (phone?.matches || still?.matches) next();
    }, TIMER_MS);
    return () => clearInterval(timer);
  }, [next]);

  const label = t(`kind.${topic.kind}`);
  return (
    <p className="sky-line">
      <button type="button" onClick={() => take(topic.word)} aria-label={t("aria", { label, word: topic.word })}>
        <small>{label}</small>
        <b key={topic.word}>{topic.word}</b>
        <span aria-hidden="true">↗</span>
      </button>
      <span className="sky-line-taken" role="status">
        {taken ? t("taken", { word: taken }) : ""}
      </span>
    </p>
  );
}
