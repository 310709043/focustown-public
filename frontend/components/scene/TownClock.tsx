"use client";

import { useEffect, useState } from "react";

const WD = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MN = [
  "JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC",
];

export function TownClock() {
  const [now, setNow] = useState<Date | null>(null);
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
    <div className="absolute top-[10px] right-[12px] text-right z-[6] bg-glass border border-border rounded px-2.5 py-1 backdrop-blur-md">
      <div
        className="font-mono text-[18px] leading-none tracking-wider"
        style={{ color: "var(--a2)", textShadow: "0 0 8px var(--a1)" }}
      >
        {hh}:{mm}
      </div>
      <div className="text-[9px] text-muted mt-px tracking-wider">
        {WD[now.getDay()]} · {MN[now.getMonth()]} {now.getDate()}
      </div>
    </div>
  );
}
