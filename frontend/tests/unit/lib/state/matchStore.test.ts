/**
 * matchStore — discriminated status state machine.
 *
 * Worth testing:
 * - enterQueue with waiting response transitions to "waiting"
 * - enterQueue with matched response transitions straight to "proposed"
 * - applyProposed flips waiting → proposed, but is a no-op outside waiting
 * - cancelQueue clears back to "idle"
 * - skip re-enters the queue (calls auto() after skip())
 * - accept short-circuits when the match was already accepted (bot fallback)
 *
 * NOT worth testing:
 * - sessionStorage rehydrate path — hits the DOM session store + network;
 *   covered by integration / E2E.
 * - testInjectProposal — trivial bypass for E2E.
 */
import { beforeEach, expect, test, vi } from "vitest";
import { useMatchStore } from "@/lib/state/matchStore";
import { makeMatch } from "@/tests/fixtures/factories";

const propose = vi.fn();
const auto = vi.fn();
const cancelQueue = vi.fn();
const myQueue = vi.fn();
const accept = vi.fn();
const skip = vi.fn();

vi.mock("@/lib/api/endpoints", () => ({
  matchesApi: {
    propose: (...a: unknown[]) => propose(...a),
    auto: (...a: unknown[]) => auto(...a),
    cancelQueue: (...a: unknown[]) => cancelQueue(...a),
    myQueue: (...a: unknown[]) => myQueue(...a),
    accept: (...a: unknown[]) => accept(...a),
    skip: (...a: unknown[]) => skip(...a),
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

test("enterQueue with matched response transitions to proposed", async () => {
  const m = makeMatch({ id: "imm-1", candidate_character_key: "luna" });
  auto.mockResolvedValue({
    status: "matched",
    via: "waiting_pool",
    match: m,
  });

  await useMatchStore.getState().enterQueue();

  const s = useMatchStore.getState();
  expect(s.status).toBe("proposed");
  expect(s.current?.id).toBe("imm-1");
  expect(s.waitingSince).toBeNull();
});

test("applyProposed flips waiting → proposed", () => {
  useMatchStore.setState({ status: "waiting", waitingSince: 1 });
  const m = makeMatch({ id: "ws-1" });

  useMatchStore.getState().applyProposed(m);

  const s = useMatchStore.getState();
  expect(s.status).toBe("proposed");
  expect(s.current?.id).toBe("ws-1");
});

test("applyProposed is a no-op when status is not waiting", () => {
  useMatchStore.setState({ status: "proposed", current: makeMatch({ id: "first" }) });
  const m = makeMatch({ id: "second" });

  useMatchStore.getState().applyProposed(m);

  // The first proposal is preserved — duplicate WS frame doesn't overwrite.
  expect(useMatchStore.getState().current?.id).toBe("first");
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

test("skip re-enters the queue via auto()", async () => {
  useMatchStore.setState({
    status: "proposed",
    current: makeMatch({ id: "m-skip" }),
  });
  skip.mockResolvedValue(undefined);
  auto.mockResolvedValue({
    status: "waiting",
    enqueued_at_ms: 99,
    bot_fallback_at_ms: 27_099,
  });

  await useMatchStore.getState().skip();

  expect(skip).toHaveBeenCalledOnce();
  expect(auto).toHaveBeenCalledOnce();
  expect(useMatchStore.getState().status).toBe("waiting");
});

test("accept short-circuits when the match already arrived as accepted", async () => {
  useMatchStore.setState({
    status: "proposed",
    current: makeMatch({ id: "bot-1", status: "accepted" }),
  });

  const result = await useMatchStore.getState().accept();

  expect(result?.id).toBe("bot-1");
  expect(useMatchStore.getState().status).toBe("accepted");
  expect(accept).not.toHaveBeenCalled();
});

test("accept calls API for pending matches and transitions to accepted", async () => {
  useMatchStore.setState({
    status: "proposed",
    current: makeMatch({ id: "m-7", status: "pending" }),
  });
  accept.mockResolvedValue(makeMatch({ id: "m-7", status: "accepted" }));

  const updated = await useMatchStore.getState().accept();

  expect(updated?.status).toBe("accepted");
  expect(useMatchStore.getState().status).toBe("accepted");
});
