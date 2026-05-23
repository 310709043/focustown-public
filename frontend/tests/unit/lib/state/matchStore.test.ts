/**
 * matchStore — discriminated status state machine.
 *
 * Worth testing:
 * - enterQueue with waiting response transitions to "waiting"
 * - enterQueue with matched response (bot fallback) short-circuits
 *   straight to "accepted" — no modal step
 * - applyProposed auto-accepts pending matches (WS path); the previous
 *   manual proposed → user-clicks-accept flow is gone
 * - applyProposed is idempotent (duplicate WS frames don't double-accept)
 * - cancelQueue clears back to "idle"
 *
 * NOT worth testing:
 * - sessionStorage rehydrate path — hits the DOM session store + network;
 *   covered by integration / E2E.
 * - testInjectProposal — trivial bypass for E2E.
 */
import { beforeEach, expect, test, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import { useMatchStore } from "@/lib/state/matchStore";
import { makeMatch } from "@/tests/fixtures/factories";

const propose = vi.fn();
const auto = vi.fn();
const cancelQueue = vi.fn();
const myQueue = vi.fn();
const accept = vi.fn();
const skip = vi.fn();
const getById = vi.fn();

vi.mock("@/lib/api/endpoints", () => ({
  matchesApi: {
    propose: (...a: unknown[]) => propose(...a),
    auto: (...a: unknown[]) => auto(...a),
    cancelQueue: (...a: unknown[]) => cancelQueue(...a),
    myQueue: (...a: unknown[]) => myQueue(...a),
    accept: (...a: unknown[]) => accept(...a),
    skip: (...a: unknown[]) => skip(...a),
    getById: (...a: unknown[]) => getById(...a),
  },
}));

beforeEach(() => {
  useMatchStore.setState({
    status: "idle",
    current: null,
    accepted: null,
    waitingSince: null,
    botFallbackAt: null,
    cancelling: false,
  });
  propose.mockReset();
  auto.mockReset();
  cancelQueue.mockReset();
  myQueue.mockReset();
  accept.mockReset();
  skip.mockReset();
  getById.mockReset();
});

test("enterQueue with waiting response transitions to waiting", async () => {
  auto.mockResolvedValue({
    status: "waiting",
    enqueued_at_ms: 1_000_000,
    bot_fallback_at_ms: 1_028_000,
  });

  await useMatchStore.getState().enterQueue();

  const s = useMatchStore.getState();
  expect(s.status).toBe("waiting");
  expect(s.waitingSince).toBe(1_000_000);
  expect(s.botFallbackAt).toBe(1_028_000);
  expect(s.current).toBeNull();
});

test("enterQueue with bot-fallback (already-accepted match) short-circuits to accepted", async () => {
  // Bot fallback path: backend accepts on the user's behalf, so the
  // 201 response carries an already-accepted Match. No follow-up
  // accept() call needed.
  const m = makeMatch({
    id: "bot-1",
    candidate_character_key: "luna",
    status: "accepted",
  });
  auto.mockResolvedValue({
    status: "matched",
    via: "waiting_pool",
    match: m,
  });

  await useMatchStore.getState().enterQueue();

  const s = useMatchStore.getState();
  expect(s.status).toBe("accepted");
  expect(s.accepted?.id).toBe("bot-1");
  expect(s.current).toBeNull();
  expect(accept).not.toHaveBeenCalled();
});

test("enterQueue with real-user immediate pair (pending match) drives through accept()", async () => {
  // Real-user pairing path: ``_try_pair_with_waiter`` returns a PENDING
  // match. The requester (us) must call accept() to flip the row to
  // ACCEPTED and materialise the room before nav.
  const pending = makeMatch({ id: "real-1", status: "pending" });
  const accepted = makeMatch({ id: "real-1", status: "accepted" });
  auto.mockResolvedValue({
    status: "matched",
    via: "waiting_pool",
    match: pending,
  });
  accept.mockResolvedValue(accepted);

  await useMatchStore.getState().enterQueue();

  const s = useMatchStore.getState();
  expect(s.status).toBe("accepted");
  expect(s.accepted?.id).toBe("real-1");
  expect(s.accepted?.status).toBe("accepted");
  expect(accept).toHaveBeenCalledOnce();
  expect(accept).toHaveBeenCalledWith("real-1");
});

test("enterQueue immediate pair: 409 race is resolved by refetching the match", async () => {
  // The candidate side beat us to accept() — backend returns 409
  // match_not_pending. We must NOT drop to idle; instead refetch
  // via getById and propagate as accepted.
  const pending = makeMatch({ id: "race-1", status: "pending" });
  const accepted = makeMatch({ id: "race-1", status: "accepted" });
  auto.mockResolvedValue({
    status: "matched",
    via: "waiting_pool",
    match: pending,
  });
  accept.mockRejectedValue(new ApiError("match_not_pending", 409, "conflict"));
  getById.mockResolvedValue(accepted);

  await useMatchStore.getState().enterQueue();

  const s = useMatchStore.getState();
  expect(s.status).toBe("accepted");
  expect(s.accepted?.id).toBe("race-1");
  expect(getById).toHaveBeenCalledWith("race-1");
});

test("applyProposed auto-accepts a pending WS proposal", async () => {
  useMatchStore.setState({ status: "waiting", waitingSince: 1 });
  const m = makeMatch({ id: "ws-1", status: "pending" });
  accept.mockResolvedValue(makeMatch({ id: "ws-1", status: "accepted" }));

  await useMatchStore.getState().applyProposed(m);

  const s = useMatchStore.getState();
  expect(s.status).toBe("accepted");
  expect(s.accepted?.id).toBe("ws-1");
  expect(accept).toHaveBeenCalledOnce();
});

test("applyProposed is a no-op when status is not waiting", async () => {
  useMatchStore.setState({
    status: "accepting",
    current: makeMatch({ id: "first" }),
  });
  const m = makeMatch({ id: "second" });

  await useMatchStore.getState().applyProposed(m);

  // The in-flight accept is preserved — duplicate WS frame doesn't overwrite.
  expect(useMatchStore.getState().current?.id).toBe("first");
  expect(accept).not.toHaveBeenCalled();
});

test("applyProposed short-circuits when match already arrived accepted", async () => {
  useMatchStore.setState({ status: "waiting", waitingSince: 1 });
  const m = makeMatch({ id: "bot-2", status: "accepted" });

  await useMatchStore.getState().applyProposed(m);

  const s = useMatchStore.getState();
  expect(s.status).toBe("accepted");
  expect(s.accepted?.id).toBe("bot-2");
  // Server-side already accepted — no second HTTP call.
  expect(accept).not.toHaveBeenCalled();
});

test("cancelQueue clears back to idle", async () => {
  useMatchStore.setState({ status: "waiting", waitingSince: 1, botFallbackAt: 2 });
  cancelQueue.mockResolvedValue(undefined);

  await useMatchStore.getState().cancelQueue();

  const s = useMatchStore.getState();
  expect(s.status).toBe("idle");
  expect(s.waitingSince).toBeNull();
  expect(cancelQueue).toHaveBeenCalledOnce();
});
