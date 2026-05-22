import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.toml" },
        miniflare: {
          compatibilityDate: "2026-05-15",
          compatibilityFlags: ["nodejs_compat"],
          r2Buckets: ["AUDIO_BUCKET"],
          bindings: {
            AUDIO_PROXY_SECRET: "test-audio-secret-please-rotate-32chars",
            ALLOWED_ORIGINS: "https://lowbatterytown.com",
            ALLOWED_REFERERS: "https://lowbatterytown.com/",
            TRACK_KEY_PREFIX: "tracks/",
          },
        },
      },
    },
  },
});
