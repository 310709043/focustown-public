"use client";

import { useEffect, useState } from "react";
import { useRouter } from "@/i18n/routing";
import { useAuthStore } from "@/lib/state/authStore";
import { tokenStore } from "@/lib/api/client";

export const GUEST_SESSION_KEY = "ft_guest";

/** Returns true if the user has entered guest preview mode. */
export function isGuestMode(): boolean {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(GUEST_SESSION_KEY) === "1";
}

/**
 * Redirect unauthenticated users to signin. Returns `true` once auth
 * is confirmed so the page can render; while hydrating, the page
 * should show a loading state (or nothing).
 *
 * Guest preview mode: if `sessionStorage["ft_guest"] === "1"`, skip
 * auth redirect and allow unauthenticated access to /town. The town
 * page renders without a real user — presence/wallet/match features
 * are gracefully inert since they all null-check `user`.
 */
export function useAuthGuard(): { ready: boolean; isGuest: boolean } {
  const user = useAuthStore((s) => s.user);
  const hydrate = useAuthStore((s) => s.hydrate);
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (isGuestMode()) {
      setReady(true);
      return;
    }
    const tokens = tokenStore.load();
    if (!tokens) {
      router.replace("/signin");
      return;
    }
    if (user) {
      setReady(true);
      return;
    }
    let cancelled = false;
    void hydrate().then(() => {
      if (cancelled) return;
      const current = useAuthStore.getState().user;
      if (current) {
        setReady(true);
      } else {
        router.replace("/signin");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [user, hydrate, router]);

  return { ready, isGuest: isGuestMode() };
}
