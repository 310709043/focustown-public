/** The scripted chat is a test fixture, never a public production feature. */
export function demoEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.LBT_ENABLE_DEMO === "1";
}
