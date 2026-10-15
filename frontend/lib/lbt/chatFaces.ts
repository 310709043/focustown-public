/**
 * Faces for the two batteries on the chat stage. A face answers what just
 * happened in the conversation (typing, a reply, a plug, the last minute),
 * never the battery level, gender or age: the bodies stay full and the
 * accessories come from the avatar pair. CSS draws each face from
 * `data-x` on the battery (components/lbt/SceneBattery.tsx).
 */

export type Face =
  | "idle"
  | "thinking"
  | "notice"
  | "talk"
  | "happy"
  | "laugh"
  | "hopeful"
  | "cheer"
  | "wistful"
  | "sleep";

/** A face that lasts a moment and then settles back to the resting one. */
export type Flash = "talk" | "notice" | "happy" | "laugh" | "cheer";

/** How long each passing face lasts, in ms. */
export const FACE_MS: Record<Flash, number> = {
  talk: 1000,
  notice: 1400,
  happy: 1500,
  laugh: 1700,
  cheer: 1900,
};

/** How long the stars and the badge stay after both plug in, in ms. */
export const CHEER_MS = 2600;

/** The receiver looks up this long after a message leaves, so the two don't move at once. */
export const REACT_DELAY_MS = 450;

/** A laugh in either language (or the usual signs of one) makes the reader laugh along. */
const LAUGH = /哈哈|笑死|XD|lol|haha|😂|🤣/i;

/**
 * How the reader of a new message reacts: a laugh is contagious, a reply to
 * what they said last makes them happy, anything else makes them look up.
 */
export function reactionFace(
  text: string | undefined,
  isReplyToReader: boolean,
): "laugh" | "happy" | "notice" {
  if (text && LAUGH.test(text)) return "laugh";
  return isReplyToReader ? "happy" : "notice";
}

export interface FaceContext {
  extendMine: boolean;
  extendPartner: boolean;
  lastMinute: boolean;
  partnerTyping: boolean;
}

/** The face a battery rests on when nothing new is happening. */
export function restingFace(side: "self" | "partner", context: FaceContext): Face {
  const plugged = side === "self" ? context.extendMine : context.extendPartner;
  const both = context.extendMine && context.extendPartner;
  if (plugged && !both) return "hopeful";
  if (context.lastMinute) return "wistful";
  if (side === "partner" && context.partnerTyping) return "thinking";
  return "idle";
}
