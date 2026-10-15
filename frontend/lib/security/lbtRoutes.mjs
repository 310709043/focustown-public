/**
 * The public LowBatteryTown pages (home, demo, unlock, guide and its
 * articles, policies) in either locale. They get the strict CSP in middleware.ts and
 * the per-request nonce in cloudflare-worker.mjs (via scripts/build-csp.mjs).
 * Plain .mjs so the build script can import it too.
 */
export const LBT_PUBLIC_ROUTE =
  /^\/(zh-TW|en)(\/(demo|unlock|guide(\/[^/]+)?|policies\/(privacy|terms|guidelines)))?\/?$/;

export const isLbtPublicRoute = (pathname) => LBT_PUBLIC_ROUTE.test(pathname);
