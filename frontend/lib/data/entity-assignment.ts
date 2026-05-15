import { hashUserId } from "./hash";

/**
 * Every moving thing on the town street is a real online user. Each user
 * is deterministically assigned to exactly one of four entity kinds by
 * stable hash, so identity persists across reloads and reconnections.
 */
export type EntityKind = "walker" | "car" | "dog" | "bird";

export const ENTITY_KINDS: readonly EntityKind[] = [
  "walker",
  "car",
  "dog",
  "bird",
];

export function entityKindFor(userId: string): EntityKind {
  return ENTITY_KINDS[hashUserId(userId) % ENTITY_KINDS.length];
}
