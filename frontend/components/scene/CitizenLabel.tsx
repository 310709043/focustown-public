"use client";

import { useTranslations } from "next-intl";
import { statusByCode, type StatusCode } from "@/lib/data/statuses";

/**
 * Unified dot-separated head label for every moving player + bot in the
 * city scene. Rendered above the sprite as a single pixel pill:
 *
 *     Name · Status · Activity
 *
 * - When `activity` is null the third segment (and its leading dot) is
 *   omitted, so real users without a `role_label` cleanly degrade to
 *   "Name · Status".
 * - Self users get an amber accent + the i18n "you" suffix appended to
 *   the name; otherwise the pill border tracks `statusByCode(status).color`.
 * - `prefix` carries the per-entity emoji (🐕 / 🐦 / vehicle plate) so
 *   each scene component reads at a glance which kind it is.
 * - `borderOverride` lets vehicles keep the equipped body colour as the
 *   accent rim, preserving visual identity for cosmetic purchases.
 */

type Size = "md" | "sm" | "xs";

type SizeTokens = {
  fontSize: number;
  paddingY: number;
  paddingX: number;
  radius: number;
};

const SIZES: Record<Size, SizeTokens> = {
  md: { fontSize: 11, paddingY: 2, paddingX: 6, radius: 4 },
  sm: { fontSize: 10, paddingY: 1, paddingX: 5, radius: 4 },
  xs: { fontSize: 8, paddingY: 1, paddingX: 4, radius: 3 },
};

type CitizenLabelProps = {
  name: string;
  statusCode: StatusCode;
  activity: string | null;
  isSelf: boolean;
  size?: Size;
  prefix?: string;
  borderOverride?: string;
};

export function CitizenLabel({
  name,
  statusCode,
  activity,
  isSelf,
  size = "md",
  prefix,
  borderOverride,
}: CitizenLabelProps) {
  const t = useTranslations("town.scene");
  const status = statusByCode(statusCode);
  const tokens = SIZES[size];

  const borderColor = isSelf
    ? "var(--amber)"
    : borderOverride ?? status.color;
  const textColor = isSelf ? "var(--amber)" : "var(--a2)";
  const background = isSelf
    ? "rgba(252,211,77,0.10)"
    : "rgba(3,1,17,0.85)";
  const textShadow = isSelf
    ? "0 0 4px var(--amber), 0 0 10px rgba(252,211,77,0.55)"
    : "0 0 4px var(--a1)";

  const displayName = isSelf ? `${name} ・ ${t("youSuffix")}` : name;

  return (
    <div
      key={status.code}
      className="animate-statusPop font-japan"
      style={{
        background,
        border: `1px solid ${borderColor}`,
        color: textColor,
        fontSize: tokens.fontSize,
        padding: `${tokens.paddingY}px ${tokens.paddingX}px`,
        borderRadius: tokens.radius,
        whiteSpace: "nowrap",
        letterSpacing: 0.5,
        textShadow,
        textAlign: "center",
      }}
    >
      {prefix ? `${prefix} ` : null}
      {displayName}
      <span style={{ color: status.color, marginLeft: 4 }}>
        · {t(`statuses.${status.code}`)}
      </span>
      {activity ? (
        <span style={{ color: "var(--a3)", marginLeft: 4 }}>
          · {activity}
        </span>
      ) : null}
    </div>
  );
}
