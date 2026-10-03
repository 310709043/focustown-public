import { NICKNAME_MAX } from "./constants";

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

/**
 * Trim, strip control characters and cap at NICKNAME_MAX *characters*
 * (code points, so an emoji is never cut in half). Falls back when the
 * result is empty.
 */
export function normalizeNickname(raw: string, fallback: string): string {
  const cleaned = raw.replace(CONTROL_CHARS, "").trim();
  const capped = Array.from(cleaned).slice(0, NICKNAME_MAX).join("").trim();
  return capped || fallback;
}
