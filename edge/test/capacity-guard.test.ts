import { env, createExecutionContext } from "cloudflare:test";
import { describe, expect, test } from "vitest";
import staging from "../scripts/staging-entry";

const key = "isolated-capacity-test-secret-not-for-production";
const bindings = { ...env, LBT_CAPACITY_MODE: "isolated", LBT_CAPACITY_KEY: key };
const host = "https://lbt-capacity-test.owner.workers.dev";
function request(path = "/healthz", secret = key, ip = "2001:db8::1", base = host) {
  return new Request(base + path, { headers: { "X-LBT-Capacity-Key": secret, "X-LBT-Capacity-IP": ip } });
}
describe("isolated capacity entrypoint", () => {
  test("refuses production hosts even with a valid test key", async () => {
    expect((await staging.fetch(request("/healthz", key, "2001:db8::1", "https://api.lowbatterytown.com"), bindings, createExecutionContext())).status).toBe(503);
  });
  test("fails closed without explicit mode or secret", async () => {
    expect((await staging.fetch(request(), { ...bindings, LBT_CAPACITY_MODE: undefined }, createExecutionContext())).status).toBe(503);
    expect((await staging.fetch(request(), { ...bindings, LBT_CAPACITY_KEY: undefined }, createExecutionContext())).status).toBe(503);
  });
  test("requires the private capacity key", async () => {
    expect((await staging.fetch(request("/healthz", "wrong"), bindings, createExecutionContext())).status).toBe(403);
  });
  test("does not expose admin, reports or feedback", async () => {
    for (const path of ["/admin", "/api/v1/admin/lbt/overview", "/api/v1/lbt/reports", "/api/v1/lbt/feedback"]) {
      expect((await staging.fetch(request(path), bindings, createExecutionContext())).status).toBe(404);
    }
  });
  test("only accepts synthetic documentation IPs", async () => {
    expect((await staging.fetch(request("/healthz", key, "127.0.0.1"), bindings, createExecutionContext())).status).toBe(400);
  });
  test("serves the original API after authentication", async () => {
    const response = await staging.fetch(request(), bindings, createExecutionContext());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });
});
