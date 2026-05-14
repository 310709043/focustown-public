"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

const WD = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MN = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export function TownClock() {
  const [now, setNow] = useState<Date | null>(null);
  const t = useTranslations("town.clock");
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);
  if (!now) return null;
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return (
    <div
      className="pixel-panel absolute top-[12px] right-[14px] text-right z-[6] px-3 py-1.5"
      title={t("tooltip")}
    >
      <div
        className="font-mono leading-none tracking-widest flex items-center justify-end"
        style={{ fontSize: 22, color: "var(--a2)", textShadow: "0 0 10px var(--a1)" }}
      >
        <span>{hh}</span>
        <span className="animate-blink mx-[1px]">:</span>
        <span>{mm}</span>
      </div>
      <div
        className="font-pixel-en mt-1"
        style={{ fontSize: 9, color: "var(--dir-ink-mute)", letterSpacing: 2 }}
      >
        {WD[now.getDay()]} · {MN[now.getMonth()]} {now.getDate()}
      </div>
    </div>
  );
}
