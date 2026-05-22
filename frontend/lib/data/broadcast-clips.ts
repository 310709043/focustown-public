/**
 * Town Broadcast playlist — short MP4 clips that loop in the billboard
 * AD slot.
 *
 * Hosted on Cloudflare R2 (chosen over S3 + CloudFront because R2 egress
 * is free; for a clip that thousands of users may stream concurrently
 * this is the difference between ~$0 / month and tens of dollars).
 *
 * The host comes from ``NEXT_PUBLIC_R2_BROADCAST_HOST`` so ops can swap
 * the bucket without redeploying the frontend. When the env is empty
 * the component falls back to a static placeholder — no broken
 * <video> request, no CSP noise.
 */
export interface BroadcastClip {
  /** Filename inside the R2 bucket (no path prefix). */
  file: string;
}

const RAW_HOST = process.env.NEXT_PUBLIC_R2_BROADCAST_HOST ?? "";

/** Resolved (trailing-slash stripped) base URL, or empty when unconfigured. */
export const BROADCAST_HOST = RAW_HOST.replace(/\/+$/, "");

export const BROADCAST_CLIPS: ReadonlyArray<BroadcastClip> = [
  { file: "clip-01.mp4" },
  { file: "clip-02.mp4" },
  { file: "clip-03.mp4" },
  { file: "clip-04.mp4" },
  { file: "clip-05.mp4" },
  { file: "clip-06.mp4" },
  { file: "clip-07.mp4" },
  { file: "clip-08.mp4" },
  { file: "clip-09.mp4" },
  { file: "clip-10.mp4" },
];

export function broadcastClipUrl(clip: BroadcastClip): string {
  if (!BROADCAST_HOST) return "";
  return `${BROADCAST_HOST}/${clip.file}`;
}

export function isBroadcastConfigured(): boolean {
  return BROADCAST_HOST.length > 0;
}
