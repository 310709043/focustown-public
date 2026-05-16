"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";

export type TabKey = "role" | "interests" | "skills" | "all";

interface TabBarProps {
  active: TabKey;
  onChange: (next: TabKey) => void;
  interestsCount: number;
  skillsCount: number;
}

/**
 * Tabs across the top of the right column. Interest + skill tabs show
 * a small `Badge` with the current selection count, matching reference.
 * The "ALL" tab is rendered as a literal "ALL" string for pixel-font
 * consistency rather than a translated label.
 */
export function TabBar({ active, onChange, interestsCount, skillsCount }: TabBarProps) {
  const t = useTranslations("characters.selectPage");
  return (
    <div style={{ display: "flex", gap: 4 }}>
      <TabButton active={active === "role"} onClick={() => onChange("role")}>
        {t("role")}
      </TabButton>
      <TabButton active={active === "interests"} onClick={() => onChange("interests")}>
        {t("interests")} <Badge>{interestsCount}</Badge>
      </TabButton>
      <TabButton active={active === "skills"} onClick={() => onChange("skills")}>
        {t("skills")} <Badge>{skillsCount}</Badge>
      </TabButton>
      <TabButton active={active === "all"} onClick={() => onChange("all")}>
        ALL
      </TabButton>
    </div>
  );
}

function TabButton({
  children,
  active,
  onClick,
}: {
  children: ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-active={active || undefined}
      className="font-silkscreen"
      style={{
        padding: "6px 12px",
        background: active ? "var(--accent)" : "rgba(0,0,0,0.3)",
        color: active ? "#0a0524" : "var(--ink-mute)",
        border: `1px solid ${active ? "var(--accent)" : "var(--panel-stroke)"}`,
        fontSize: 11,
        letterSpacing: "0.12em",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      {children}
    </button>
  );
}

function Badge({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        background: "rgba(0,0,0,0.3)",
        padding: "0 4px",
        fontSize: 9,
        color: "inherit",
        border: "1px solid rgba(0,0,0,0.3)",
      }}
    >
      {children}
    </span>
  );
}
