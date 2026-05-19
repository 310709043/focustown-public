"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

interface SupportViewProps {
  onClose: () => void;
  onOpenFeedback: () => void;
}

interface FaqItem {
  q: string;
  a: string;
}

export function SupportView({ onClose, onOpenFeedback }: SupportViewProps) {
  const t = useTranslations("profile.support");
  const tModal = useTranslations("profile.modal");
  const faqs = (t.raw("faqs") as FaqItem[]) ?? [];
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  return (
    <div
      data-testid="support-view"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 14,
        padding: "20px 24px",
        overflowY: "auto",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span
          className="font-silkscreen"
          style={{
            fontSize: 12,
            letterSpacing: "0.32em",
            color: "var(--accent-2)",
          }}
        >
          ● {t("title")}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label={tModal("closeAria")}
          className="font-silkscreen"
          style={{
            padding: "6px 12px",
            fontSize: 11,
            letterSpacing: "0.25em",
            color: "var(--ink-mute)",
            background: "transparent",
            border: "1px solid var(--panel-stroke)",
            cursor: "pointer",
          }}
        >
          ✕ {tModal("close")}
        </button>
      </header>

      <p
        className="font-silkscreen"
        style={{
          margin: 0,
          fontSize: 11,
          letterSpacing: "0.18em",
          color: "var(--ink-mute)",
          lineHeight: 1.8,
        }}
      >
        {t("subtitle")}
      </p>

      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        {faqs.map((faq, idx) => {
          const open = openIdx === idx;
          return (
            <li
              key={idx}
              data-testid="support-faq-row"
              className="pixel-panel"
              style={{
                padding: 0,
                background: "rgba(20,10,55,0.45)",
              }}
            >
              <button
                type="button"
                onClick={() => setOpenIdx(open ? null : idx)}
                aria-expanded={open}
                className="font-silkscreen"
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  fontSize: 12,
                  letterSpacing: "0.14em",
                  color: "var(--ink)",
                  background: "transparent",
                  border: "none",
                  textAlign: "left",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                }}
              >
                <span>{faq.q}</span>
                <span
                  aria-hidden
                  style={{
                    color: "var(--accent-2)",
                    fontSize: 14,
                    transform: open ? "rotate(45deg)" : "none",
                    transition: "transform 0.2s ease",
                  }}
                >
                  +
                </span>
              </button>
              {open ? (
                <p
                  className="font-silkscreen"
                  style={{
                    margin: 0,
                    padding: "0 14px 14px",
                    fontSize: 11,
                    lineHeight: 1.8,
                    letterSpacing: "0.12em",
                    color: "var(--ink-mute)",
                  }}
                >
                  {faq.a}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={onOpenFeedback}
          className="pixel-btn font-silkscreen"
          style={{
            padding: "10px 18px",
            fontSize: 11,
            letterSpacing: "0.28em",
            background: "var(--accent-2)",
            borderColor: "var(--accent-2)",
            color: "#0c0524",
          }}
        >
          {t("feedbackCta")}
        </button>
      </div>
    </div>
  );
}
