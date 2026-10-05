// Flat config for ESLint 9. Next 16 removed `next lint`; this is the
// same "next/core-web-vitals" rule set the old .eslintrc.json extended.
import coreWebVitals from "eslint-config-next/core-web-vitals";

const config = [
  {
    ignores: [
      ".next/**",
      ".open-next/**",
      ".wrangler/**",
      "node_modules/**",
      "playwright-report/**",
      "test-results/**",
      "coverage/**",
      "public/**",
      "next-env.d.ts",
    ],
  },
  ...coreWebVitals,
  {
    // New in eslint-config-next 16 (React Compiler readiness). They flag
    // patterns the Next 15 config accepted, mostly in legacy Focus Town
    // pages; warnings until those are cleaned up, so the upgrade itself
    // does not change what lint enforces.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/purity": "warn",
    },
  },
];

export default config;
