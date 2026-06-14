"use client";

import { useEffect, useState } from "react";
import { useRouter } from "@/i18n/routing";
import { useAuthStore } from "@/lib/state/authStore";
import { tokenStore } from "@/lib/api/client";

/**
 * Redirect unauthenticated users to signin. Returns `true` once auth
 * is confirmed so the page can render; while hydrating, the page
 * should show a loading state (or nothing).
 */
export function useAuthGuard(): { ready: boolean } {
  const user = useAuthStore((s) => s.user);
  const hydrate = useAuthStore((s) => s.hydrate);
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
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

  return { ready };
}
