"use client";

import { useTranslations } from "next-intl";

interface NicknameFieldProps {
  value: string;
  onChange: (value: string) => void;
}

/**
 * 20-char nickname input. Reference caps at 20 chars and pipes the
 * value into the preview card so the user sees their CITIZEN ID
 * update live as they type.
 */
export function NicknameField({ value, onChange }: NicknameFieldProps) {
  const t = useTranslations("characters.selectPage");
  return (
    <input
      data-testid="nickname-input"
      className="pixel-input"
      placeholder={t("nicknameHint")}
      value={value}
      maxLength={20}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
