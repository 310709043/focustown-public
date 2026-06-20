"use client";

import { useCallback, useEffect, useState } from "react";

import { useAchievementToastStore } from "@/lib/state/achievementToastStore";
import { AchievementUnlockToast } from "./AchievementUnlockToast";

export function AchievementToastManager() {
  const queue = useAchievementToastStore((s) => s.queue);
  const shift = useAchievementToastStore((s) => s.shift);
  const [visible, setVisible] = useState(false);

  const current = queue[0] ?? null;

  useEffect(() => {
    if (current) {
      setVisible(true);
    }
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDismiss = useCallback(() => {
    setVisible(false);
    // Wait for exit animation before dequeuing next
    setTimeout(() => shift(), 500);
  }, [shift]);

  if (!current) return null;

  return (
    <AchievementUnlockToast
      name={current.name}
      icon={current.icon}
      visible={visible}
      onDismiss={handleDismiss}
    />
  );
}
