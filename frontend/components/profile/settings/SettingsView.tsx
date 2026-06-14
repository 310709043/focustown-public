"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";

import {
  PREF_FOCUS_DAILY_GOAL,
  PREF_FOCUS_DURATION_MINUTES,
  PREF_LANGUAGE_PREFERRED,
  PREF_NOTIFICATIONS_DAILY,
  PREF_UI_SCENE_ROTATION,
  usePreferencesStore,
} from "@/lib/state/preferencesStore";
import { pushErrorToast, pushInfoToast } from "@/lib/state/toastStore";

interface SettingsViewProps {
  onClose: () => void;
}

interface NotificationsDaily {
  enabled: boolean;
  time: string;
}

export function SettingsView({ onClose }: SettingsViewProps) {
  const t = useTranslations("profile.settings");
  const tModal = useTranslations("profile.modal");
  const byKey = usePreferencesStore((s) => s.byKey);
  const hydrated = usePreferencesStore((s) => s.hydrated);
  const ensureHydrated = usePreferencesStore((s) => s.ensureHydrated);
  const patch = usePreferencesStore((s) => s.patch);

  useEffect(() => {
    void ensureHydrated();
  }, [ensureHydrated]);

  const notif = (byKey[PREF_NOTIFICATIONS_DAILY] as NotificationsDaily) ?? {
    enabled: false,
    time: "09:00",
  };
  const language =
    (byKey[PREF_LANGUAGE_PREFERRED] as "zh-TW" | "en") ?? "zh-TW";
  const goal = Number(byKey[PREF_FOCUS_DAILY_GOAL] ?? 4);
  const duration = Number(byKey[PREF_FOCUS_DURATION_MINUTES] ?? 25);
  const rotate = Boolean(byKey[PREF_UI_SCENE_ROTATION] ?? true);

  async function save(p: Record<string, unknown>) {
    try {
      await patch(p);
      pushInfoToast(t("savedToast"));
    } catch {
      pushErrorToast(t("saveError"));
    }
  }

  return (
    <div
      data-testid="settings-view"
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

      {!hydrated ? (
        <div
          className="font-silkscreen"
          style={{
            padding: "24px 12px",
            border: "1px dashed var(--panel-stroke)",
            fontSize: 11,
            letterSpacing: "0.22em",
            color: "var(--ink-mute)",
            textAlign: "center",
          }}
        >
          ◌ {t("loading")}
        </div>
      ) : null}

      <Section title={t("sectionNotifications")}>
        <label
          className="font-silkscreen"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontSize: 11,
            color: "var(--ink)",
          }}
        >
          <input
            type="checkbox"
            checked={notif.enabled}
            onChange={(e) =>
              save({
                [PREF_NOTIFICATIONS_DAILY]: {
                  ...notif,
                  enabled: e.target.checked,
                },
              })
            }
          />
          {t("notificationsDailyLabel")}
        </label>
        <label
          className="font-silkscreen"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontSize: 10,
            color: "var(--ink-mute)",
          }}
        >
          {t("notificationsDailyTimeLabel")}
          <input
            type="time"
            value={notif.time}
            onChange={(e) =>
              save({
                [PREF_NOTIFICATIONS_DAILY]: {
                  ...notif,
                  time: e.target.value,
                },
              })
            }
            className="pixel-input"
            style={{ flex: 1 }}
          />
        </label>
      </Section>

      <Section title={t("sectionLanguage")}>
        <div style={{ display: "flex", gap: 6 }}>
          {([
            ["zh-TW", t("languageZh")],
            ["en", t("languageEn")],
          ] as const).map(([code, label]) => (
            <button
              key={code}
              type="button"
              onClick={() =>
                save({ [PREF_LANGUAGE_PREFERRED]: code })
              }
              className="font-silkscreen"
              style={{
                padding: "6px 14px",
                fontSize: 11,
                letterSpacing: "0.2em",
                color: language === code ? "#0c0524" : "var(--ink-mute)",
                background:
                  language === code
                    ? "var(--accent-3)"
                    : "rgba(20,10,55,0.55)",
                border: "1px solid var(--panel-stroke)",
                cursor: "pointer",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </Section>

      <Section title={t("sectionFocus")}>
        <label
          className="font-silkscreen"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontSize: 11,
            color: "var(--ink)",
          }}
        >
          {t("dailyGoalLabel")}
          <select
            value={goal}
            onChange={(e) =>
              save({ [PREF_FOCUS_DAILY_GOAL]: Number(e.target.value) })
            }
            className="pixel-input"
          >
            {[2, 4, 6, 8].map((n) => (
              <option key={n} value={n}>
                {n} 🔋
              </option>
            ))}
          </select>
        </label>
        <label
          className="font-silkscreen"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontSize: 11,
            color: "var(--ink)",
          }}
        >
          {t("durationLabel")}
          <select
            value={duration}
            onChange={(e) =>
              save({
                [PREF_FOCUS_DURATION_MINUTES]: Number(e.target.value),
              })
            }
            className="pixel-input"
          >
            {[15, 25, 50, 90].map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
      </Section>

      <Section title={t("sectionAppearance")}>
        <label
          className="font-silkscreen"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontSize: 11,
            color: "var(--ink)",
          }}
        >
          <input
            type="checkbox"
            checked={rotate}
            onChange={(e) =>
              save({ [PREF_UI_SCENE_ROTATION]: e.target.checked })
            }
          />
          {t("sceneRotationLabel")}
        </label>
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="pixel-panel"
      style={{
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        background: "rgba(20,10,55,0.45)",
      }}
    >
      <span
        className="font-silkscreen"
        style={{
          fontSize: 10,
          letterSpacing: "0.32em",
          color: "var(--accent-2)",
        }}
      >
        ● {title}
      </span>
      {children}
    </section>
  );
}
