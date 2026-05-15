/**
 * `entityKindFor` contract:
 *
 * - Deterministic: same userId → same kind, always.
 * - Returns one of the four declared kinds.
 * - Roughly uniform: across many synthetic IDs, no kind is starved.
 *
 * NOT worth testing:
 * - Exact bucket boundaries — they're an implementation detail of the
 *   underlying hash; pinning them turns the test into a regression
 *   tripwire on harmless renames.
 */
import { describe, expect, test } from "vitest";

import {
  ENTITY_KINDS,
  entityKindFor,
  type EntityKind,
} from "@/lib/data/entity-assignment";

describe("entityKindFor", () => {
  test("is deterministic for the same userId", () => {
    const id = "11111111-2222-3333-4444-555555555555";
    const first = entityKindFor(id);
    for (let i = 0; i < 100; i++) {
      expect(entityKindFor(id)).toBe(first);
    }
  });

  test("returns one of the four declared kinds", () => {
    const ids = Array.from({ length: 50 }, (_, i) => `u-${i}-${Math.random()}`);
    for (const id of ids) {
      const kind = entityKindFor(id);
      expect(ENTITY_KINDS).toContain(kind);
    }
  });

  test("distributes across all four kinds for a sufficiently large sample", () => {
    const counts: Record<EntityKind, number> = {
      walker: 0,
      car: 0,
      dog: 0,
      bird: 0,
    };
    for (let i = 0; i < 4000; i++) {
      const id = `user-${i}`;
      counts[entityKindFor(id)] += 1;
    }
    // Every kind has at least 10% of the sample — far below the 25%
    // expected mean, but high enough to fail loud if any bucket gets
    // starved by a future hash change.
    for (const kind of ENTITY_KINDS) {
      expect(counts[kind]).toBeGreaterThan(400);
    }
  });
});
