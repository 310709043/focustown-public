import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

// Deliberately isolated from production and from the ordinary test run.
export default defineConfig(async () => {
  const count = Number(process.env.LBT_CAPACITY_GUESTS ?? "100");
  if (![100, 300, 500].includes(count)) throw new Error("Capacity scenario must be 100, 300 or 500 guests");
  return {
  plugins: [cloudflareTest({
    wrangler: { configPath: "./wrangler.jsonc" },
    miniflare: { bindings: {
      TEST_MIGRATIONS: await readD1Migrations("./migrations"),
      LBT_TOKEN_SECRET: "capacity-test-only-secret-at-least-32-characters",
      ADMIN_TOKEN: "capacity-test-only-admin",
      CAPACITY_GUESTS: String(count),
    } },
  })],
  test: { include: ["scripts/capacity.scenario.ts"], setupFiles: ["./test/setup.ts"], testTimeout: 120_000 },
  };
});
