import { spawnSync } from "node:child_process";

// Start fresh workerd instances for each scale. The ordinary pool shares recent
// visitors between cases; accumulating old sockets distorts a capacity result.
for (const count of [100, 300, 500]) {
  const result = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run",
    "--config", "scripts/capacity.config.ts"], {
    stdio: "inherit", timeout: 150_000,
    env: { ...process.env, LBT_CAPACITY_GUESTS: String(count) },
  });
  if (result.error || result.status !== 0) {
    if (result.error) console.error(result.error.message);
    process.exit(result.status || 1);
  }
}
