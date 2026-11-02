import { useEffect } from "react";

import { useUnlocks } from "./unlocks";

/** End a promotional scene even if the home page stays open overnight. */
export function useUnlockExpiry() {
  const deadline = useUnlocks((s) => s.expiresAt);
  const expire = useUnlocks((s) => s.expire);
  useEffect(() => {
    if (deadline === null) return;
    let timer: ReturnType<typeof setTimeout>;
    const check = () => {
      const remaining = deadline - Date.now();
      if (remaining <= 0) expire();
      else timer = setTimeout(check, Math.min(remaining, 24 * 3_600_000));
    };
    check();
    return () => clearTimeout(timer);
  }, [deadline, expire]);
}
