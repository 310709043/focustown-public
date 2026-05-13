"use client";

import { useEffect, useRef } from "react";
import { realtime, type WsMessage } from "./client";

export function useRealtime(handler: (msg: WsMessage) => void) {
  const ref = useRef(handler);
  ref.current = handler;

  useEffect(() => {
    realtime.connect();
    const off = realtime.on((m) => ref.current(m));
    return () => {
      off();
    };
  }, []);

  return realtime;
}
