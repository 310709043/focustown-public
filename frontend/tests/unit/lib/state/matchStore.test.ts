/**
 * matchStore — propose / requestAuto / accept / skip transitions.
 *
 * Worth testing:
 * - propose surfaces the returned match as `current` and clears `proposing`
 * - requestAuto surfaces the auto-matched candidate as `current`
 * - requestAuto clears `current` and returns null when the API rejects
 * - accept clears `current` and returns the updated match
 * - accept short-circuits when the match already arrived as `accepted`
 *   (bot matches), avoiding a redundant /accept HTTP call
 * - skip clears `current`
 * - accept/skip with no current is a safe no-op
 *
 * NOT worth testing:
 * - `clear()` — trivial.
 */
import { beforeEach, expect, test, vi } from "vitest";
import { useMatchStore } from "@/lib/state/matchStore";
import { makeMatch } from "@/tests/fixtures/factories";

const propose = vi.fn();
const auto = vi.fn();
const accept = vi.fn();
const skip = vi.fn();

vi.mock("@/lib/api/endpoints", () => ({
  matchesApi: {
    propose: (...a: unknown[]) => propose(...a),
    auto: (...a: unknown[]) => auto(...a),
    accept: (...a: unknown[]) => accept(...a),
    skip: (...a: unknown[]) => skip(...a),
  },
}));

beforeEach(() => {
  useMatchStore.setState({ current: null, proposing: false });
  propose.mockReset();
  auto.mockReset();
  accept.mockReset();
  skip.mockReset();
});

test("propose surfaces the returned match and clears proposing", async () => {
  const m = makeMatch({ id: "m-99" });
  propose.mockResolvedValue(m);

  await useMatchStore.getState().propose("u-2");

  expect(useMatchStore.getState().current?.id).toBe("m-99");
  expect(useMatchStore.getState().proposing).toBe(false);
});

test("accept clears current and returns the updated match", async () => {
  useMatchStore.setState({ current: makeMatch({ id: "m-7" }) });
  accept.mockResolvedValue(makeMatch({ id: "m-7", status: "accepted" }));

  const updated = await useMatchStore.getState().accept();

  expect(updated?.status).toBe("accepted");
  expect(useMatchStore.getState().current).toBeNull();
});

test("skip clears current", async () => {
  useMatchStore.setState({ current: makeMatch({ id: "m-7" }) });
  skip.mockResolvedValue(undefined);

  await useMatchStore.getState().skip();

  expect(useMatchStore.getState().current).toBeNull();
});

test("accept with no current is a no-op returning null", async () => {
  const result = await useMatchStore.getState().accept();
  expect(result).toBeNull();
  expect(accept).not.toHaveBeenCalled();
});

test("requestAuto surfaces the auto-matched candidate as current", async () => {
  const m = makeMatch({ id: "auto-1", candidate_character_key: "luna" });
  auto.mockResolvedValue(m);

  const result = await useMatchStore.getState().requestAuto();

  expect(result?.id).toBe("auto-1");
  expect(useMatchStore.getState().current?.candidate_character_key).toBe("luna");
  expect(useMatchStore.getState().proposing).toBe(false);
});

test("requestAuto clears current and returns null when the API rejects", async () => {
  useMatchStore.setState({ current: makeMatch({ id: "stale" }) });
  auto.mockRejectedValue(new Error("no candidates"));

  const result = await useMatchStore.getState().requestAuto();

  expect(result).toBeNull();
  expect(useMatchStore.getState().current).toBeNull();
  expect(useMatchStore.getState().proposing).toBe(false);
});

test("accept short-circuits when the match already arrived as accepted (bot)", async () => {
  useMatchStore.setState({
    current: makeMatch({ id: "bot-1", status: "accepted" }),
  });

  const result = await useMatchStore.getState().accept();

  expect(result?.id).toBe("bot-1");
  expect(result?.status).toBe("accepted");
  expect(useMatchStore.getState().current).toBeNull();
  expect(accept).not.toHaveBeenCalled();
});
