import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      // Scope coverage to code we can meaningfully regress. Sprite pixel
      // tables, character roster lookups, scene-backdrop manifests, and
      // pure presentational components are configuration / view code —
      // not branching logic — so they're excluded from both numerator
      // and denominator. The 80% target applies to logic.
      include: [
        "lib/**/*.{ts,tsx}",
        // Only audio components actually have logic (event handling,
        // store dispatches, source selection). Other component dirs
        // are visual emitters covered by Playwright.
        "components/audio/**/*.{ts,tsx}",
      ],
      exclude: [
        "lib/api/types.gen.ts",
        "**/*.d.ts",
        // Pixel-art data: raw colour arrays + draw helpers built around
        // them. Pure data; testing them is a tautology.
        "lib/pixel/sprites/**",
        "lib/pixel/skyline.ts",
        "lib/pixel/sprite.ts",
        // Static lookup tables (rosters, mapping tables, manifests).
        "lib/data/broadcast.ts",
        "lib/data/character-mapping.ts",
        "lib/data/job-to-avatar.ts",
        "lib/data/profileOptions.ts",
        "lib/data/directions.ts",
        "lib/data/sceneBackdrops.ts",
        "lib/data/character-backgrounds.ts",
        "lib/data/focusBackgrounds.ts",
        // Next.js font-loader config — no logic, just `Font(...)` calls.
        "lib/fonts.ts",
        // Constant exports (legal versions, contact addrs) — not code paths.
        "lib/config/legal.ts",
        // Audio components that drive the HTMLAudioElement directly. Their
        // behaviour is observable only through real DOM audio (autoplay
        // policy, src swap, currentTime seek, crossfade ramps) — that's
        // Playwright territory. The PURE logic (source selection, cursor
        // walking) lives in stationStore which IS unit-tested.
        "components/audio/GlobalAudioMount.tsx",
        "components/audio/FloatingMusicPlayer.tsx",
        "components/audio/PersonalRadio.tsx",
        "components/audio/SyncedRoomPlayer.tsx",
        // Typed API client wrappers — every function is a one-line
        // `return apiFetch<T>("/api/...")`. Unit-testing them is a
        // mock-shape tautology; the transport (apiFetch) is covered
        // separately in lib/api/client.ts.
        "lib/api/endpoints.ts",
        // Heavy hooks that drive real-time periodic syncs (rAF / setInterval /
        // WebSocket lifecycle entangled with React effects). Their
        // observable behaviour lives at the integration level (Playwright
        // + real backend); unit-mocking everything they touch would
        // only test the mocks.
        "lib/hooks/useFocusRoomOwnerSync.ts",
        "lib/hooks/useUserStats.ts",
        "lib/hooks/useWalletTransactions.ts",
        "lib/hooks/useAmbientCycle.ts",
        // Pixel/canvas drawing helpers — jsdom has no canvas impl, so
        // testing these requires the `canvas` npm package + Playwright-
        // level visual checks. Out of scope for unit.
        "lib/pixel/pngSprite.ts",
      ],
    },
  },
});
