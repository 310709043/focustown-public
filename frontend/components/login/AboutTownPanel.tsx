"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { BlinkDot } from "@/components/pixel/BlinkDot";

interface Tip {
  icon: string;
  heading: string;
  body: string;
}

const ROTATE_MS = 7000;

export function AboutTownPanel() {
  const t = useTranslations("auth.about");
  const tips = t.raw("tips") as Tip[];
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (tips.length <= 1) return;
    const id = window.setInterval(
      () => setIndex((i) => (i + 1) % tips.length),
      ROTATE_MS,
    );
    return () => window.clearInterval(id);
  }, [tips.length]);

  const tip = tips[index] ?? tips[0];
  const advance = () => setIndex((i) => (i + 1) % tips.length);

  return (
    <aside
      aria-label={t("eyebrow")}
      data-testid="about-town-panel"
      className="font-silkscreen"
      style={{
        width: "min(580px, 92vw)",
        padding: "12px 16px",
        background: "rgba(8,4,30,0.78)",
        border: "1px dashed var(--accent-2)",
        boxShadow:
          "0 0 0 1px rgba(45,212,191,0.18), 0 0 24px rgba(45,212,191,0.18)",
        color: "var(--ink-mute)",
        letterSpacing: "0.18em",
        fontSize: 10,
        display: "flex",
        alignItems: "center",
        gap: 16,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
          minWidth: 124,
          paddingRight: 14,
          borderRight: "1px dashed rgba(45,212,191,0.45)",
        }}
      >
        <span
          style={{
            color: "var(--accent-2)",
            fontSize: 10,
            letterSpacing: "0.32em",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <BlinkDot color="var(--accent-2)" marginRight={2} />
          {t("eyebrow")}
        </span>
        <span
          style={{
            fontSize: 9,
            letterSpacing: "0.28em",
            color: "var(--accent-2)",
            opacity: 0.85,
            lineHeight: 1.6,
          }}
        >
          {t("footer")}
        </span>
      </div>

      <div
        key={index}
        className="animate-fadeUp"
        data-testid="about-town-tip"
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 12,
          minWidth: 0,
          flex: 1,
        }}
      >
        <span
          aria-hidden
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 26,
            height: 26,
            background: "rgba(45,212,191,0.12)",
            border: "1px solid var(--accent-2)",
            color: "var(--accent-2)",
            fontSize: 14,
            flexShrink: 0,
          }}
        >
          {tip.icon}
        </span>
        <div style={{ minWidth: 0 }}>
          <div
            className="font-pixel"
            style={{
              fontSize: 13,
              color: "#f9a8d4",
              letterSpacing: "0.1em",
              marginBottom: 4,
            }}
          >
            {tip.heading}
          </div>
          <p
            style={{
              margin: 0,
              lineHeight: 1.6,
              color: "var(--ink-mute)",
              fontSize: 10,
              letterSpacing: "0.12em",
            }}
          >
            {tip.body}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={advance}
        aria-label={t("nextTipAria")}
        data-testid="about-town-next"
        className="font-silkscreen"
        style={{
          flexShrink: 0,
          width: 28,
          height: 28,
          background: "rgba(45,212,191,0.10)",
          border: "1px solid rgba(45,212,191,0.45)",
          color: "var(--accent-2)",
          fontSize: 14,
          lineHeight: 1,
          cursor: "pointer",
        }}
      >
        ≡
      </button>
    </aside>
  );
}
