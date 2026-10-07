/**
 * Chat avatars: the battery family. The server picks a pair per
 * conversation (`avatarPair`, mirrored in edge/src/avatars.ts and
 * backend lbt_rules.avatar_pair) and sends each side as `avatar` in the
 * lbt.matched profiles, so both people see the same two avatars and never
 * the same one twice in a chat. An avatar is decoration only: it says
 * nothing about energy, gender or age.
 */
export const AVATAR_IDS = [
  "headphones",
  "blanket",
  "coffee",
  "beanie",
  "glasses",
  "scarf",
  "umbrella",
  "cathood",
  "flower",
  "plug",
] as const;

export type AvatarId = (typeof AVATAR_IDS)[number];

export function isAvatarId(value: unknown): value is AvatarId {
  return (AVATAR_IDS as readonly unknown[]).includes(value);
}

/** FNV-1a over the id's UTF-16 code units (ids are ASCII), 32-bit unsigned. */
function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Two different avatars for a conversation: [guest A's, guest B's]. */
export function avatarPair(conversationId: string): [AvatarId, AvatarId] {
  const h = fnv1a(conversationId);
  const n = AVATAR_IDS.length;
  const a = h % n;
  const b = (a + 1 + (Math.floor(h / n) % (n - 1))) % n;
  return [AVATAR_IDS[a] as AvatarId, AVATAR_IDS[b] as AvatarId];
}
