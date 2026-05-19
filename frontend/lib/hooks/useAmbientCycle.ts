"use client";

import { useEffect } from "react";

import { useAmbientStore } from "@/lib/state/ambientStore";

/**
 * Reader for the auto-cycling ambient. Mounting once initializes the
 * store on the client and drives `tick(now)` via requestAnimationFrame.
 * Multiple mounts share one rAF loop because the store is a singleton.
 */
export function useAmbientCycle() {
  useEffect(() => {
    useAmbientStore.getState().initialize();
    let raf = 0;
    const loop = (now: number) => {
      useAmbientStore.getState().tick(now);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
}
