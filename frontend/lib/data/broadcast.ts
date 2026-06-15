/**
 * Focus Town broadcast — the modes that play on the SkyWindow CRT.
 *
 * Two kinds today:
 *   • `sponsor` — pixel CTA card (legacy ad mode).
 *   • `video` — YouTube iframe in CRT chrome (lofi-girl-style livestream).
 *
 * The user supplies real sponsor links + YouTube embed IDs at runtime;
 * the `PLACEHOLDER` defaults below render inert (sponsor href="#",
 * video embed loads nothing) so the surface is reviewable visually
 * without leaking traffic anywhere.
 *
 * To add a new mode, extend `BroadcastMode` with a discriminator and
 * teach `SkyWindow.tsx`'s broadcast switch how to render it.
 */
export type BroadcastMode =
  | {
      kind: "sponsor";
      /** Headline shown above the CTA. */
      title: string;
      /** Button label. */
      label: string;
      /** Destination URL. `#` keeps it inert until a real link lands. */
      href: string;
      /** Small tag pill above the title (e.g. "SPONSOR", "PRO"). */
      tag: string;
      /** Accent color for the tag pill background. */
      accent: string;
    }
  | {
      kind: "video";
      provider: "youtube";
      /** YouTube video ID for the lofi livestream. PLACEHOLDER until
       *  a real ID is supplied — iframe loads nothing in that state. */
      embedId: string;
      /** Bottom-left channel branding. */
      channelLabel: string;
      /** Tag pill ("ON AIR"). */
      tag: string;
    };

/**
 * Active broadcast carousel — rotates every N seconds in SkyWindow.
 * Reorder / extend freely; the rotation simply cycles in index order.
 *
 * TODO(broadcast): replace placeholders with real sponsor links + the
 * actual YouTube embed ID; when a real `video.embedId` lands,
 * `next.config.mjs` must add `https://www.youtube-nocookie.com` to
 * `frame-src`. Grep for this comment to find the CSP edit.
 */
export const BROADCAST_MODES: ReadonlyArray<BroadcastMode> = [
  {
    kind: "sponsor",
    tag: "SPONSOR",
    title: "Notion · One workspace for everything",
    label: "Try free",
    href: "#",
    accent: "#fff",
  },
  {
    kind: "video",
    provider: "youtube",
    embedId: "PLACEHOLDER",
    channelLabel: "FOCUSTOWN.TV · LOFI 24",
    tag: "ON AIR",
  },
];

/** Rotation tick in ms — SkyWindow uses this when swapping modes. */
export const BROADCAST_ROTATE_MS = 9000;

/**
 * Build the YouTube iframe URL for a `video` mode. Always muted —
 * audio is owned by the BottomHUD MusicPlayer; the video provides
 * picture only.
 */
export function buildYouTubeEmbedSrc(embedId: string): string {
  if (!embedId || embedId === "PLACEHOLDER") return "";
  const params = new URLSearchParams({
    autoplay: "1",
    mute: "1",
    loop: "1",
    playlist: embedId,
    controls: "0",
    modestbranding: "1",
    playsinline: "1",
    rel: "0",
    iv_load_policy: "3",
  });
  return `https://www.youtube-nocookie.com/embed/${embedId}?${params.toString()}`;
}
