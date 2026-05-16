/**
 * Reverse lookup: backend `character_key` → display avatar sprite.
 *
 * The user picks a character on `/select-character` and the choice is
 * persisted as `character_key` (one of `luna/kai/milo/...`). When we
 * later need to render that user as a pixel sprite (top-bar status
 * pill, walking citizens, leaderboard rows, …) we resolve it through
 * this map. Mapping mirrors the semantic alignment used elsewhere in
 * the codebase; unknown / missing keys fall back to the first avatar.
 */

import { AVATARS, type AvatarDef } from "@/lib/pixel/sprites/avatars";

const TO_AVATAR_ID: Readonly<Record<string, string>> = {
  luna: "designer",
  kai: "frontend",
  milo: "novelist",
  aria: "researcher",
  zoe: "musician",
  rex: "photo",
  nyx: "philo",
  bear: "barista",
  leo: "crypto",
  panda: "data",
  uni: "astronaut",
  drake: "gamer",
  hawk: "blackhat",
  finn: "ux",
  ink: "writer",
  nova: "pm",
  tora: "marketing",
  rio: "lang",
  lyra: "astro",
  sage: "eco",
  doc: "health",
  mei: "teacher",
  toki: "chef",
  yuki: "mystery",
  film: "content",
  mind: "psych",
  tally: "accountant",
  just: "lawyer",
  run: "athlete",
  stu: "student",
};

export function characterKeyToAvatar(characterKey?: string | null): AvatarDef {
  if (!characterKey) return AVATARS[0];
  const id = TO_AVATAR_ID[characterKey];
  if (!id) return AVATARS[0];
  return AVATARS.find((a) => a.id === id) ?? AVATARS[0];
}
