"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

import {
  BROADCAST_CLIP_IDS,
  isBroadcastConfigured,
} from "@/lib/data/broadcast-clips";
import {
  getBroadcastPlayUrl,
  invalidateBroadcast,
} from "@/lib/broadcast/playUrlCache";

/**
 * Rotating R2-clip player — the presentation-agnostic body of the
 * broadcast pane. Fetches a fresh signed URL per active clip from the
 * playUrlCache, plays muted/inline, and advances on ``onEnded``.
 *
 * Render contract:
 *   - returns ``null`` when ``NEXT_PUBLIC_BROADCAST_PROXY_BASE_URL`` is
 *     unset or the token fetch failed; callers render their own static
 *     fallback so this component never decides chrome
 *   - sizing comes from the parent via ``className`` / ``style`` props
 *     (no built-in width/height/borders) so the same player works in
 *     SkyWindow's video tab, the standalone Billboard slot, etc.
 *
 * Originally lived inside ``Billboard.tsx`` (Tier-2 broadcast PR #136)
 * but Billboard itself was never mounted on /town, leaving the AD
 * column showing a TUNING placeholder instead of real clips. Extracted
 * so SkyWindow's VideoPicture can fall back to it when ``embedId`` is
 * the ``"PLACEHOLDER"`` sentinel.
 */
export function BroadcastClipPlayer({
  className,
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  const configured = isBroadcastConfigured();
  const [index, setIndex] = useState(0);
  const [src, setSrc] = useState<string>("");
  const [failed, setFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!configured || failed) {
      setSrc("");
      return;
    }
    const clipId = BROADCAST_CLIP_IDS[index] ?? BROADCAST_CLIP_IDS[0];
    let cancelled = false;
    (async () => {
      try {
        const url = await getBroadcastPlayUrl(clipId);
        if (!cancelled) setSrc(url);
      } catch {
        invalidateBroadcast(clipId);
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [index, configured, failed]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !src) return;
    el.load();
    void el.play().catch(() => {
      /* autoplay blocked despite muted — leave first frame visible */
    });
  }, [src]);

  if (!configured || failed || !src) return null;

  return (
    <video
      ref={videoRef}
      data-testid="broadcast-clip-player"
      src={src}
      muted
      autoPlay
      playsInline
      preload="metadata"
      controlsList="nodownload noremoteplayback"
      disablePictureInPicture
      disableRemotePlayback
      onContextMenu={(e) => e.preventDefault()}
      onEnded={() =>
        setIndex((i) => (i + 1) % BROADCAST_CLIP_IDS.length)
      }
      onError={() => {
        const clipId =
          BROADCAST_CLIP_IDS[index] ?? BROADCAST_CLIP_IDS[0];
        invalidateBroadcast(clipId);
        setFailed(true);
      }}
      className={className}
      style={{ objectFit: "cover", ...style }}
    />
  );
}
