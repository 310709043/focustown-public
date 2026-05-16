import type { FocusSession, Match, User, Wallet } from "@/lib/api/types.gen";

/**
 * Test factories for typed shapes pulled from the OpenAPI types.
 * They build *minimal* but valid objects — override the fields a given
 * test cares about, default the rest.
 */

export function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "u-1",
    email: "alice@example.com",
    display_name: "Alice",
    character_key: null,
    role_label: null,
    marketing_opt_in: false,
    equipped_vehicle_item_id: null,
    equipped_vehicle: null,
    ...overrides,
  };
}

export function makeFocusSession(overrides: Partial<FocusSession> = {}): FocusSession {
  return {
    id: "s-1",
    user_id: "u-1",
    partner_user_id: null,
    mode: "focus",
    duration_seconds: 1500,
    elapsed_seconds: 0,
    remaining_seconds: 1500,
    status: "active",
    task_label: null,
    started_at: "2026-05-15T12:00:00Z",
    ended_at: null,
    ...overrides,
  };
}

export function makeMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: "m-1",
    requester_id: "u-1",
    candidate_id: "u-2",
    requester_character_key: null,
    candidate_character_key: null,
    compatibility: 80,
    reason: "compatible",
    status: "pending",
    created_at: "2026-05-15T12:00:00Z",
    ...overrides,
  };
}

export function makeWallet(overrides: Partial<Wallet> = {}): Wallet {
  return {
    currency_code: "T",
    balance_minor: 0,
    ...overrides,
  };
}
