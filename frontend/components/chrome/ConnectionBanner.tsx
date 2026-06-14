"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { realtime, type WsConnectionState } from "@/lib/ws/client";

/**
 * Thin banner that appears at the top of the viewport when the WebSocket
 * is reconnecting. Automatically hides once the connection is restored.
 * Mounted once in the locale layout alongside <Toaster />.
 */
export function ConnectionBanner() {
  const t = useTranslations("common.connection");
  const [wsState, setWsState] = useState<WsConnectionState>(realtime.state);

  useEffect(() => {
    // Sync initial state (may have changed between render and effect)
    setWsState(realtime.state);
    const unsub = realtime.onStateChange(setWsState);
    return () => { unsub(); };
  }, []);

  if (wsState !== "reconnecting") return null;

  return (
    <div
      data-testid="connection-banner"
      role="status"
      aria-live="polite"
      className="font-silkscreen"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 70,
        padding: "6px 16px",
        fontSize: 10,
        letterSpacing: "0.18em",
        color: "var(--accent-2)",
        background:
          "linear-gradient(180deg, rgba(7,4,26,0.95) 0%, rgba(7,4,26,0.85) 100%)",
        borderBottom: "1px solid var(--accent-2)",
        textAlign: "center",
        pointerEvents: "none",
      }}
    >
      {t("reconnecting")}
    </div>
  );
}
