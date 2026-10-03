// Bindings seen by tests through `env` from "cloudflare:workers".
type LbtEnv = import("../src/config").Env;
type LbtD1Migration = import("@cloudflare/vitest-pool-workers").D1Migration;

declare namespace Cloudflare {
  interface Env extends LbtEnv {
    TEST_MIGRATIONS: LbtD1Migration[];
  }
}
