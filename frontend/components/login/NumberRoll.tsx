"use client";

import { useEffect, useState } from "react";

interface NumberRollProps {
  target: number;
  /** Starting offset below the target — animates upward by easing. */
  catchUp?: number;
}

/**
 * Roll-up counter — animates from `target - catchUp` to `target` with
 * ease-out steps every 60 ms. Used by the citizens count in the
 * login top bar to make the rendered number feel "live" on mount.
 */
export function NumberRoll({ target, catchUp = 80 }: NumberRollProps) {
  const [n, setN] = useState(Math.max(0, target - catchUp));

  useEffect(() => {
    let cur = Math.max(0, target - catchUp);
    setN(cur);
    const id = window.setInterval(() => {
      cur = Math.min(target, cur + Math.ceil((target - cur) / 8));
      setN(cur);
      if (cur >= target) window.clearInterval(id);
    }, 60);
    return () => window.clearInterval(id);
  }, [target, catchUp]);

  return (
    <span className="animate-countUp" style={{ display: "inline-block" }}>
      {n.toLocaleString()}
    </span>
  );
}
